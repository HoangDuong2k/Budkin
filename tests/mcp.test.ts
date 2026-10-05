import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { delimiter, join } from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AiActivity, McpLaunch } from '../src/shared/api'
import { addDays, localDateOf } from '../src/shared/datetime'
import type { AiAccess } from '../src/shared/types'
import { TestClock } from '../src/main/clock'
import { Db } from '../src/main/db/connection'
import { migrate } from '../src/main/db/migrations'
import { BudkinLink, createBridgeServer } from '../src/main/mcp/bridge'
import { claudeCodeCommand, cliPath, codeState, connectCode, connectDesktop, desktopState } from '../src/main/mcp/clients'
import { McpHost } from '../src/main/mcp/host'
import { mcpSocketPath } from '../src/main/mcp/protocol'
import { AiRunner, repeatFromRule, ruleFromRepeat } from '../src/main/mcp/runner'
import { TOOLS, type RepeatInput, type ToolResult } from '../src/main/mcp/tools'
import { DataService } from '../src/main/services/data'

let db: Db
let clock: TestClock
let data: DataService
let access: AiAccess
let activity: AiActivity[]
let ai: AiRunner
let today: string

beforeEach(() => {
  db = new Db(':memory:')
  migrate(db, null)
  // 10:00 sáng hôm nay theo giờ máy: việc có giờ 09:00 hôm nay đã quá hạn, 18:00 thì chưa
  const d = new Date()
  d.setHours(10, 0, 0, 0)
  clock = new TestClock(d.getTime() - Date.now())
  data = new DataService(db, clock, () => undefined)
  access = 'full'
  activity = []
  ai = new AiRunner({ data, clock, access: () => access, activity: (a) => activity.push(a) })
  today = localDateOf(clock.now())
})

afterEach(() => db.close())

/** Gọi công cụ, trả về JSON đã đọc (lỗi thì ném ra kèm nội dung) */
async function call<T = Record<string, unknown>>(tool: string, args: unknown = {}, client = 'claude-ai'): Promise<T> {
  const r = await ai.call(tool, args, client)
  if (r.isError) throw new Error(r.content[0].text)
  return JSON.parse(r.content[0].text) as T
}

async function callError(tool: string, args: unknown = {}): Promise<string> {
  const r = await ai.call(tool, args)
  expect(r.isError).toBe(true)
  return r.content[0].text
}

type Brief = { id: string; title: string; status: string; due_date?: string; due_time?: string; overdue?: boolean; project?: string; tags?: string[]; remind_before_minutes?: number }

const openTitles = (): string[] =>
  data
    .listTasks({ scope: 'active' })
    .filter((t) => t.status !== 'done')
    .map((t) => t.title)
    .sort()

describe('công cụ MCP: quyền truy cập', () => {
  it('tắt: mọi công cụ báo lỗi; chỉ xem: đọc được, ghi bị chặn', async () => {
    access = 'off'
    expect(await callError('get_overview')).toMatch(/turned off/)
    access = 'read'
    expect((await call('get_overview')).access).toBe('view only')
    expect(await callError('create_tasks', { tasks: [{ title: 'X' }] })).toMatch(/read tasks only/)
    expect(data.listTasks({ scope: 'active' })).toEqual([])
  })

  it('tham số sai: báo lỗi cho AI tự sửa, không ghi gì', async () => {
    expect(await callError('create_tasks', { tasks: [{ title: 'X', due_date: '2026-02-30' }] })).toMatch(/Invalid arguments/)
    expect(await callError('create_tasks', { tasks: [{ title: 'X', due: 'mai' }] })).toMatch(/Invalid arguments/)
    expect(await callError('nope')).toMatch(/Unknown tool/)
    expect(data.listTasks({ scope: 'active' })).toEqual([])
  })
})

describe('công cụ MCP: đọc', () => {
  it('get_overview: ngày giờ địa phương, dự án, nhãn, số việc', async () => {
    const p = data.createProject({ name: 'Nhà', color: 'mint' })
    data.createTag({ name: 'Gấp', color: 'coral' })
    data.createTask({ title: 'Quá hạn', dueDate: addDays(today, -1), projectId: p.id })
    data.createTask({ title: 'Sáng nay', dueDate: today, dueTime: '09:00' })
    data.createTask({ title: 'Chiều nay', dueDate: today, dueTime: '18:00' })
    data.createTask({ title: 'Tuần sau', dueDate: addDays(today, 5) })
    data.createTask({ title: 'Không hạn' })
    const o = await call<{ now: { date: string; time: string; weekday: string }; counts: Record<string, number>; projects: unknown[]; tags: unknown[] }>('get_overview')
    expect(o.now.date).toBe(today)
    expect(o.now.time).toBe('10:00')
    expect(o.counts).toMatchObject({ overdue: 2, due_today: 1, upcoming_7_days: 1, no_due_date: 1, open_total: 5 })
    expect(o.projects).toEqual([{ id: p.id, name: 'Nhà', open_tasks: 1 }])
    expect(o.tags).toHaveLength(1)
  })

  it('list_tasks: hôm nay gồm cả quá hạn; sắp tới; khoảng ngày; đã xong; lọc theo dự án, nhãn, từ khoá không dấu', async () => {
    const p = data.createProject({ name: 'Công việc', color: 'sky' })
    const tag = data.createTag({ name: 'Gấp', color: 'coral' })
    data.createTask({ title: 'Báo cáo quý', dueDate: today, dueTime: '18:00', projectId: p.id, tagIds: [tag.id] })
    data.createTask({ title: 'Gọi khách hàng', dueDate: addDays(today, -2) })
    data.createTask({ title: 'Họp nhóm', dueDate: addDays(today, 3), projectId: p.id })
    data.createTask({ title: 'Đi chợ', dueDate: addDays(today, 20) })
    const done = data.createTask({ title: 'Đã nộp thuế', dueDate: today })
    data.setStatus(done.id, 'done')

    const list = async (args: Record<string, unknown>): Promise<string[]> => (await call<{ tasks: Brief[] }>('list_tasks', args)).tasks.map((t) => t.title)
    const todayList = await call<{ tasks: Brief[] }>('list_tasks', {})
    expect(todayList.tasks.map((t) => t.title)).toEqual(['Gọi khách hàng', 'Báo cáo quý'])
    expect(todayList.tasks[0].overdue).toBe(true)
    expect(todayList.tasks[1]).toMatchObject({ project: 'Công việc', tags: ['Gấp'], due_time: '18:00' })
    expect(await list({ view: 'upcoming' })).toEqual(['Họp nhóm'])
    expect(await list({ view: 'upcoming', days: 30 })).toEqual(['Họp nhóm', 'Đi chợ'])
    expect(await list({ view: 'range', from: today, to: addDays(today, 3) })).toEqual(['Báo cáo quý', 'Đã nộp thuế', 'Họp nhóm'])
    expect(await list({ view: 'done' })).toEqual(['Đã nộp thuế'])
    expect(await list({ view: 'all_open', project: 'cong viec' })).toEqual(['Báo cáo quý', 'Họp nhóm'])
    expect(await list({ view: 'all_open', tag: '#gấp' })).toEqual(['Báo cáo quý'])
    expect(await list({ view: 'all_open', search: 'bao cao' })).toEqual(['Báo cáo quý'])
    expect(await callError('list_tasks', { project: 'Không có' })).toMatch(/Projects: Công việc/)
    expect(await callError('list_tasks', { view: 'range', from: today })).toMatch(/from and to/)
  })

  it('get_task: ghi chú đầy đủ, checklist có id', async () => {
    const t = data.createTask({ title: 'Dọn nhà', notes: 'x'.repeat(400), checklist: ['Lau nhà', 'Rửa bát'] })
    const listed = await call<{ tasks: Array<Brief & { notes: string; checklist: string }> }>('list_tasks', { view: 'no_date' })
    expect(listed.tasks[0].notes.length).toBeLessThan(300)
    expect(listed.tasks[0].checklist).toBe('0/2 done')
    const { task } = await call<{ task: { notes: string; checklist: Array<{ id: string; text: string; done: boolean }> } }>('get_task', { id: t.id })
    expect(task.notes).toHaveLength(400)
    expect(task.checklist.map((c) => c.text)).toEqual(['Lau nhà', 'Rửa bát'])
  })
})

describe('công cụ MCP: ghi và hoàn tác', () => {
  it('create_tasks: dự án / nhãn theo tên (có thì dùng, chưa có thì tạo), nhắc mặc định như khung sửa việc, lặp lại', async () => {
    const home = data.createProject({ name: 'Nhà', color: 'mint' })
    const r = await call<{ created: Brief[]; new_projects: string[]; new_tags: string[] }>(
      'create_tasks',
      {
        tasks: [
          { title: 'Đóng tiền điện', due_date: addDays(today, 4), project: 'nha', tags: ['Hoá đơn'], repeat: { every: 'month', month_day: 5 } },
          { title: 'Họp nhóm', due_date: addDays(today, 1), due_time: '09:30', project: 'Công ty', tags: ['#hoa don', 'Họp'] },
          { title: 'Mua sữa', remind_before_minutes: 30 }
        ]
      },
      'claude-code'
    )
    expect(r.new_projects).toEqual(['Công ty'])
    expect(r.new_tags).toEqual(['Hoá đơn', 'Họp'])
    const [bill, meeting, milk] = r.created.map((c) => data.getTask(c.id))
    expect(bill.projectId).toBe(home.id)
    expect(bill.remindBeforeMin).toBe(0)
    expect(bill.recurrence).toMatchObject({ freq: 'monthly', interval: 1, monthDay: 5, basis: 'due' })
    expect(meeting.remindBeforeMin).toBe(15)
    expect(meeting.tagIds).toHaveLength(2)
    expect(meeting.tagIds).toContain(bill.tagIds[0])
    // Không có hạn thì không nhắc
    expect(milk.remindBeforeMin).toBeNull()

    expect(activity).toHaveLength(1)
    expect(activity[0]).toMatchObject({ client: 'Claude Code', kind: 'create', count: 3, titles: ['Đóng tiền điện', 'Họp nhóm', 'Mua sữa'] })
    ai.undo(activity[0].id)
    expect(openTitles()).toEqual([])
    expect(() => ai.undo(activity[0].id)).toThrow(/Không còn hoàn tác/)
  })

  it('create_tasks: một việc sai thì không tạo việc nào (cả dự án mới)', async () => {
    expect(await callError('create_tasks', { tasks: [{ title: 'A', project: 'Mới' }, { title: 'B', due_time: '09:00' }] })).toMatch(/due_time needs a due_date/)
    expect(data.listTasks({ scope: 'active' })).toEqual([])
    expect(data.listProjects()).toEqual([])
    expect(activity).toEqual([])
  })

  it('update_tasks: dời lịch nhiều việc, hoàn thành việc lặp lại (tạo lần sau); hoàn tác trả lại y nguyên', async () => {
    const a = data.createTask({ title: 'Viết báo cáo', dueDate: today, dueTime: '18:00', priority: 1 })
    const b = data.createTask({ title: 'Tập thể dục', dueDate: today, recurrence: { freq: 'daily', interval: 1, basis: 'due' } })
    const c = data.createTask({ title: 'Đọc sách' })
    const before = [a, b, c].map((t) => data.getTask(t.id))
    const tomorrow = addDays(today, 1)
    const r = await call<{ updated: Brief[] }>('update_tasks', {
      updates: [
        { id: a.id, due_date: tomorrow, priority: 'high', add_tags: ['Gấp'] },
        { id: b.id, status: 'done' },
        { id: c.id, due_date: tomorrow, due_time: '20:00', title: 'Đọc sách 30 phút' }
      ]
    })
    expect(r.updated.map((t) => t.due_date)).toEqual([tomorrow, today, tomorrow])
    expect(data.getTask(a.id)).toMatchObject({ dueDate: tomorrow, dueTime: '18:00', priority: 3 })
    // Lần đầu có hạn: nhắc mặc định như khi đặt hạn trong khung sửa việc
    expect(data.getTask(c.id).remindBeforeMin).toBe(15)
    expect(openTitles()).toEqual(['Viết báo cáo', 'Đọc sách 30 phút', 'Tập thể dục'].sort())
    expect(data.listTasks({ scope: 'active' }).filter((t) => t.seriesId === b.seriesId)).toHaveLength(2)

    expect(activity.at(-1)).toMatchObject({ kind: 'update', count: 3 })
    ai.undo(activity.at(-1)!.id)
    for (const prev of before) {
      const now = data.getTask(prev.id)
      expect({ ...now, updatedAt: 0, sortOrder: 0, seriesId: null, occurrenceIndex: null, nextSpawnedId: null }).toEqual({
        ...prev,
        updatedAt: 0,
        sortOrder: 0,
        seriesId: null,
        occurrenceIndex: null,
        nextSpawnedId: null
      })
    }
    // Lần kế tiếp của việc lặp lại cũng được gỡ
    expect(data.listTasks({ scope: 'active' }).filter((t) => t.seriesId === b.seriesId)).toHaveLength(1)
  })

  it('update_tasks: checklist (thêm, đánh dấu) và hoàn tác; id lạ thì không đổi gì', async () => {
    const t = data.createTask({ title: 'Chuyển nhà', checklist: ['Đóng thùng'] })
    const item = t.checklist[0].id
    await call('update_tasks', { updates: [{ id: t.id, add_checklist: ['Thuê xe', 'Báo điện nước'], check_items: [item] }] })
    expect(data.getTask(t.id).checklist.map((c) => [c.text, c.done])).toEqual([
      ['Đóng thùng', true],
      ['Thuê xe', false],
      ['Báo điện nước', false]
    ])
    ai.undo(activity.at(-1)!.id)
    expect(data.getTask(t.id).checklist.map((c) => [c.text, c.done])).toEqual([['Đóng thùng', false]])

    const missing = crypto.randomUUID()
    expect(await callError('update_tasks', { updates: [{ id: t.id, title: 'Đổi tên' }, { id: missing, title: 'X' }] })).toMatch(/không tồn tại/)
    expect(data.getTask(t.id).title).toBe('Chuyển nhà')
    expect(await callError('update_tasks', { updates: [{ id: t.id, check_items: [crypto.randomUUID()] }] })).toMatch(/does not belong/)
  })

  it('delete_tasks: xoá (cả chuỗi lặp lại nếu muốn) rồi hoàn tác', async () => {
    const a = data.createTask({ title: 'Việc A' })
    const r = data.createTask({ title: 'Uống thuốc', dueDate: today, recurrence: { freq: 'daily', interval: 1, basis: 'due' } })
    data.setStatus(r.id, 'done')
    const next = data.listTasks({ scope: 'active' }).find((t) => t.seriesId === r.seriesId && t.status === 'todo')!
    const res = await call<{ total_deleted: number }>('delete_tasks', { ids: [a.id, next.id], whole_series: true })
    expect(res.total_deleted).toBe(2)
    expect(openTitles()).toEqual([])
    ai.undo(activity.at(-1)!.id)
    expect(openTitles()).toEqual(['Uống thuốc', 'Việc A'])
  })

  it('quy tắc lặp lại: hằng năm = mỗi 12 tháng; đổi qua đổi lại không mất gì', () => {
    expect(ruleFromRepeat({ every: 'year' })).toEqual({ freq: 'monthly', interval: 12, basis: 'due' })
    const weekly: RepeatInput = { every: 'week', interval: 2, weekdays: [5, 1], until: '2027-01-01' }
    expect(repeatFromRule(ruleFromRepeat(weekly))).toEqual({ ...weekly, weekdays: [1, 5] })
    expect(() => ruleFromRepeat({ every: 'day', weekdays: [1] })).toThrow(/Invalid repeat rule/)
  })
})

describe('cầu nối MCP ↔ Budkin', () => {
  let dir: string
  let host: McpHost

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'budkin-mcp-'))
    host = new McpHost(mcpSocketPath(dir), (req) => ai.call(req.tool, req.args, req.client))
    await host.start()
  })

  afterEach(() => {
    host.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  async function connectClient(link: BudkinLink, name = 'claude-code'): Promise<Client> {
    const server = createBridgeServer((tool, args, client) => link.call(tool, args, client), '0.0.0-test')
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(a)
    const client = new Client({ name, version: '1.0.0' })
    await client.connect(b)
    return client
  }

  const text = (r: unknown): string => (r as ToolResult).content[0].text

  it('app AI thấy đủ công cụ (có mô tả, schema, gợi ý chỉ đọc / có thể xoá) và gọi được tới dữ liệu', async () => {
    const link = new BudkinLink({ socket: host.path, launch: null, version: 't' })
    const client = await connectClient(link)
    expect(client.getInstructions()).toMatch(/get_overview first/)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(TOOLS).sort())
    const create = tools.find((t) => t.name === 'create_tasks')!
    expect(create.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false })
    expect(tools.find((t) => t.name === 'delete_tasks')!.annotations?.destructiveHint).toBe(true)
    expect(tools.find((t) => t.name === 'list_tasks')!.annotations?.readOnlyHint).toBe(true)
    const items = (create.inputSchema.properties as Record<string, { items: { properties: Record<string, unknown>; additionalProperties: boolean } }>).tasks.items
    expect(Object.keys(items.properties)).toContain('due_date')
    expect(items.additionalProperties).toBe(false)

    const created = await client.callTool({ name: 'create_tasks', arguments: { tasks: [{ title: 'Gọi điện cho mẹ', due_date: today, due_time: '20:00' }] } })
    expect(created.isError).toBeFalsy()
    expect(openTitles()).toEqual(['Gọi điện cho mẹ'])
    expect(activity[0].client).toBe('Claude Code')
    // Tham số sai bị chặn ngay ở cầu nối
    const bad = await client.callTool({ name: 'create_tasks', arguments: { tasks: [{ title: 'X', extra: 1 }] } })
    expect(bad.isError).toBe(true)
    expect(openTitles()).toEqual(['Gọi điện cho mẹ'])
    await client.close()
    link.close()
  })

  it('Budkin tắt giữa chừng: báo rõ cho AI; Budkin mở lại thì tự nối lại', async () => {
    const link = new BudkinLink({ socket: host.path, launch: null, version: 't' })
    const client = await connectClient(link)
    expect(text(await client.callTool({ name: 'get_overview', arguments: {} }))).toContain(today)
    host.stop()
    await new Promise((r) => setTimeout(r, 50))
    const down = await client.callTool({ name: 'get_overview', arguments: {} })
    expect(down.isError).toBe(true)
    expect(text(down)).toMatch(/not running/)
    host = new McpHost(mcpSocketPath(dir), (req) => ai.call(req.tool, req.args, req.client))
    await host.start()
    expect(text(await client.callTool({ name: 'get_overview', arguments: {} }))).toContain(today)
    await client.close()
    link.close()
  })

  it('Budkin chưa mở: cầu nối mở Budkin rồi chờ nó sẵn sàng', async () => {
    host.stop()
    // "Budkin" giả: một tiến trình Node mở socket rồi trả lời mọi lời gọi
    const fake = join(dir, 'fake-budkin.mjs')
    writeFileSync(
      fake,
      `import { createServer } from 'net'
       setTimeout(() => {
         const server = createServer((s) => s.on('data', (d) => {
           for (const line of String(d).split('\\n').filter(Boolean)) {
             const { id, tool } = JSON.parse(line)
             s.write(JSON.stringify({ id, result: { content: [{ type: 'text', text: 'fake:' + tool }] } }) + '\\n')
           }
         }))
         server.listen(process.argv[2])
         setTimeout(() => process.exit(0), 3000)
       }, 400)`
    )
    const link = new BudkinLink({ socket: host.path, launch: { command: process.execPath, args: [fake, host.path], env: process.env }, version: 't', launchTimeoutMs: 8000 })
    const r = await link.call('get_overview', {})
    expect(r.content[0].text).toBe('fake:get_overview')
    link.close()
  })
})

describe('gắn vào Claude Desktop / Claude Code', () => {
  let dir: string
  const launch: McpLaunch = { command: '/opt/Budkin/budkin', args: ['/opt/Budkin/resources/app.asar/out/main/mcp-bridge.js', '--data-dir', '/home/u/.config/Budkin'], env: { ELECTRON_RUN_AS_NODE: '1' } }
  const env = (extra: NodeJS.ProcessEnv): { platform: NodeJS.Platform; env: NodeJS.ProcessEnv; home: string } => ({ platform: 'linux', env: { PATH: '', ...extra }, home: join(dir, 'home') })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'budkin-clients-'))
    mkdirSync(join(dir, 'home'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('Claude Desktop: chưa cài → missing; thêm mục budkin, giữ nguyên cấu hình khác, giữ bản gốc; đổi chỗ cài → outdated', () => {
    const claude = join(dir, 'Claude')
    expect(desktopState(launch, env({ BUDKIN_CLAUDE_DESKTOP_DIR: claude })).state).toBe('missing')
    mkdirSync(claude)
    const e = env({ BUDKIN_CLAUDE_DESKTOP_DIR: claude })
    const file = join(claude, 'claude_desktop_config.json')
    const original = { theme: 'dark', mcpServers: { other: { command: 'x', args: [] } } }
    writeFileSync(file, JSON.stringify(original))
    expect(desktopState(launch, e)).toEqual({ state: 'available', configPath: file })
    connectDesktop(launch, e)
    const written = JSON.parse(readFileSync(file, 'utf8'))
    expect(written).toEqual({ theme: 'dark', mcpServers: { other: { command: 'x', args: [] }, budkin: { command: launch.command, args: launch.args, env: launch.env } } })
    expect(JSON.parse(readFileSync(`${file}.before-budkin`, 'utf8'))).toEqual(original)
    expect(desktopState(launch, e).state).toBe('connected')
    expect(desktopState({ ...launch, command: '/tmp/Budkin.AppImage' }, e).state).toBe('outdated')
    // File hỏng: báo lỗi, không ghi đè
    writeFileSync(file, '{ hỏng')
    expect(() => connectDesktop(launch, e)).toThrow(/Không đọc được/)
    expect(readFileSync(file, 'utf8')).toBe('{ hỏng')
  })

  it('Claude Desktop chưa có file cấu hình: tạo mới', () => {
    const claude = join(dir, 'Claude')
    mkdirSync(claude)
    connectDesktop(launch, env({ BUDKIN_CLAUDE_DESKTOP_DIR: claude }))
    expect(JSON.parse(readFileSync(join(claude, 'claude_desktop_config.json'), 'utf8')).mcpServers.budkin.command).toBe(launch.command)
  })

  it('Claude Code: lệnh để chép (đúng dấu nháy theo hệ điều hành)', () => {
    const spaced: McpLaunch = { command: '/home/u/My Apps/Budkin.AppImage', args: ['--mcp-bridge', '--data-dir', "/home/u/it's"] }
    expect(claudeCodeCommand(spaced, 'linux')).toBe(`claude mcp add budkin --scope user -- '/home/u/My Apps/Budkin.AppImage' --mcp-bridge --data-dir '/home/u/it'\\''s'`)
    const win: McpLaunch = { command: 'C:\\Users\\An\\AppData\\Local\\Programs\\Budkin\\Budkin.exe', args: ['C:\\x y\\mcp-bridge.js'], env: { ELECTRON_RUN_AS_NODE: '1' } }
    expect(claudeCodeCommand(win, 'win32')).toBe(
      'claude mcp add budkin --scope user -e ELECTRON_RUN_AS_NODE=1 -- "C:\\Users\\An\\AppData\\Local\\Programs\\Budkin\\Budkin.exe" "C:\\x y\\mcp-bridge.js"'
    )
  })

  it.skipIf(process.platform === 'win32')('Claude Code: tìm lệnh claude, chạy claude mcp add, nhận ra đã kết nối', async () => {
    const bin = join(dir, 'home', '.local', 'bin')
    mkdirSync(bin, { recursive: true })
    const log = join(dir, 'calls.txt')
    const cli = join(bin, 'claude')
    writeFileSync(cli, `#!/bin/sh\necho "$@" >> '${log}'\n`)
    chmodSync(cli, 0o755)
    const e = env({ CLAUDE_CONFIG_DIR: join(dir, 'cc') })
    expect(codeState(launch, env({ BUDKIN_CLAUDE_CLI: '' })).state).toBe('missing')
    expect(codeState(launch, e)).toMatchObject({ state: 'available', cli })
    await connectCode(launch, e)
    expect(readFileSync(log, 'utf8').trim()).toBe(`mcp add budkin --scope user -e ELECTRON_RUN_AS_NODE=1 -- ${launch.command} ${launch.args.join(' ')}`)
    // Claude Code ghi cấu hình vào ~/.claude.json (ở đây: CLAUDE_CONFIG_DIR)
    mkdirSync(join(dir, 'cc'))
    writeFileSync(join(dir, 'cc', '.claude.json'), JSON.stringify({ mcpServers: { budkin: { type: 'stdio', command: launch.command, args: launch.args, env: launch.env } } }))
    expect(codeState(launch, e).state).toBe('connected')
    // Đã có mục cũ: gỡ rồi thêm lại
    await connectCode({ ...launch, command: '/new/budkin' }, e)
    expect(readFileSync(log, 'utf8').trim().split('\n').slice(1)).toEqual([
      'mcp remove budkin --scope user',
      `mcp add budkin --scope user -e ELECTRON_RUN_AS_NODE=1 -- /new/budkin ${launch.args.join(' ')}`
    ])
    expect(existsSync(join(dir, 'home', '.claude.json'))).toBe(false)
  })

  it('Claude Code: PATH khi chạy lệnh claude có thư mục của chính lệnh đó và các chỗ Homebrew / bộ cài hay đặt', () => {
    const e = env({ PATH: ['/usr/bin', '/bin'].join(delimiter) })
    expect(cliPath('/opt/homebrew/bin/claude', e).split(delimiter)).toEqual(['/opt/homebrew/bin', '/usr/bin', '/bin', '/usr/local/bin', join(dir, 'home', '.local', 'bin')])
  })

  it.skipIf(process.platform === 'win32')('Claude Code cài qua npm (#!/usr/bin/env node) chạy được cả khi app mở từ Dock / menu (PATH tối thiểu)', async () => {
    // node giả nằm cạnh lệnh claude (như Homebrew: /opt/homebrew/bin/node và /opt/homebrew/bin/claude), ngoài PATH
    const bin = join(dir, 'brew', 'bin')
    mkdirSync(bin, { recursive: true })
    const log = join(dir, 'calls.txt')
    writeFileSync(join(bin, 'budkin-fake-node'), `#!/bin/sh\nshift\necho "$@" >> '${log}'\n`)
    writeFileSync(join(bin, 'claude'), '#!/usr/bin/env budkin-fake-node\n')
    chmodSync(join(bin, 'budkin-fake-node'), 0o755)
    chmodSync(join(bin, 'claude'), 0o755)
    const e = env({ PATH: '/usr/bin:/bin', BUDKIN_CLAUDE_CLI: join(bin, 'claude'), CLAUDE_CONFIG_DIR: join(dir, 'cc') })
    await connectCode(launch, e)
    expect(readFileSync(log, 'utf8')).toContain('mcp add budkin --scope user')
  })
})

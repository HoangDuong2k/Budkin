// Handler IPC cho dữ liệu: kiểm tra tham số bằng zod rồi gọi DataService
import { z } from 'zod'
import {
  checklistPatchSchema,
  checklistTextSchema,
  idSchema,
  orderMoveSchema,
  projectCreateSchema,
  projectPatchSchema,
  settingsPatchSchema,
  statusSchema,
  tagCreateSchema,
  tagPatchSchema,
  taskCreateSchema,
  taskListScopeSchema,
  taskMoveSchema,
  taskPatchSchema
} from '../shared/schemas'
import type { Settings } from '../shared/types'
import type { HandlerGroup } from './ipc'
import type { DataService } from './services/data'

type DataChannels =
  | 'tasks:list'
  | 'tasks:get'
  | 'tasks:create'
  | 'tasks:update'
  | 'tasks:setStatus'
  | 'tasks:move'
  | 'tasks:delete'
  | 'tasks:restore'
  | 'tasks:skip'
  | 'projects:list'
  | 'projects:create'
  | 'projects:update'
  | 'projects:delete'
  | 'tags:list'
  | 'tags:create'
  | 'tags:update'
  | 'tags:delete'
  | 'checklist:add'
  | 'checklist:update'
  | 'checklist:delete'
  | 'checklist:move'
  | 'settings:get'
  | 'settings:update'

export function dataHandlers(data: DataService, onSettings: (s: Settings) => void): HandlerGroup<DataChannels> {
  return {
    'tasks:list': { args: z.tuple([taskListScopeSchema]), run: (scope) => data.listTasks(scope) },
    'tasks:get': { args: z.tuple([idSchema]), run: (id) => data.getTask(id) },
    'tasks:create': { args: z.tuple([taskCreateSchema]), run: (input) => data.createTask(input) },
    'tasks:update': { args: z.tuple([idSchema, taskPatchSchema]), run: (id, patch) => data.updateTask(id, patch) },
    'tasks:setStatus': { args: z.tuple([idSchema, statusSchema]), run: (id, status) => data.setStatus(id, status) },
    'tasks:move': { args: z.tuple([idSchema, taskMoveSchema]), run: (id, move) => data.moveTask(id, move) },
    'tasks:delete': { args: z.tuple([idSchema, z.enum(['one', 'series'])]), run: (id, mode) => void data.deleteTask(id, mode) },
    'tasks:restore': { args: z.tuple([z.array(idSchema).max(500)]), run: (ids) => data.restoreTasks(ids) },
    'tasks:skip': { args: z.tuple([idSchema]), run: (id) => data.skipOccurrence(id) },

    'projects:list': { args: z.tuple([]), run: () => data.listProjects() },
    'projects:create': { args: z.tuple([projectCreateSchema]), run: (input) => data.createProject(input) },
    'projects:update': { args: z.tuple([idSchema, projectPatchSchema]), run: (id, patch) => data.updateProject(id, patch) },
    'projects:delete': { args: z.tuple([idSchema]), run: (id) => data.deleteProject(id) },

    'tags:list': { args: z.tuple([]), run: () => data.listTags() },
    'tags:create': { args: z.tuple([tagCreateSchema]), run: (input) => data.createTag(input) },
    'tags:update': { args: z.tuple([idSchema, tagPatchSchema]), run: (id, patch) => data.updateTag(id, patch) },
    'tags:delete': { args: z.tuple([idSchema]), run: (id) => data.deleteTag(id) },

    'checklist:add': { args: z.tuple([idSchema, checklistTextSchema]), run: (taskId, text) => data.addChecklistItem(taskId, text) },
    'checklist:update': { args: z.tuple([idSchema, checklistPatchSchema]), run: (id, patch) => data.updateChecklistItem(id, patch) },
    'checklist:delete': { args: z.tuple([idSchema]), run: (id) => data.deleteChecklistItem(id) },
    'checklist:move': { args: z.tuple([idSchema, orderMoveSchema]), run: (id, move) => data.moveChecklistItem(id, move) },

    'settings:get': { args: z.tuple([]), run: () => data.getSettings() },
    'settings:update': {
      args: z.tuple([settingsPatchSchema]),
      run: (patch) => {
        const settings = data.updateSettings(patch)
        onSettings(settings)
        return settings
      }
    }
  }
}

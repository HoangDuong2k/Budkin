// Nội dung trang giới thiệu — tiếng Anh (/Budkin/en/). Cùng cấu trúc với vi.ts.
import type { Dict } from './vi'

export const en: Dict = {
  lang: 'en',
  locale: 'en_US',
  title: 'Budkin — a desk with a robot that reminds you',
  description:
    'A free task manager for Windows, macOS and Ubuntu: lists, Kanban and a calendar on a 3D desk, with a little robot that follows your cursor and speaks up when things are due.',
  ogImage: { src: 'og-en.png', alt: 'Budkin: a 3D desk with a task list on the monitor, a reminder robot and a desk lamp' },
  nav: {
    download: 'Download',
    github: 'Source code on GitHub',
    switchLang: { label: 'VI', title: 'Tiếng Việt', href: '/' },
    menu: 'Menu'
  },
  hero: {
    eyebrow: 'Free · open source',
    title: 'Your to-do list, on a desk with a robot keeping time',
    description:
      'Budkin is a task manager for your computer. The monitor on the desk is where you write things down, the robot beside it follows your cursor and speaks up when something is due, and the desk lamp switches between light and dark.',
    download: 'Download Budkin',
    source: 'View source',
    footnote: 'Windows · macOS · Ubuntu — your data stays on your computer',
    shot: { src: 'desk-night.png', alt: 'The Budkin desk with the lamp off: a task list on the monitor, the robot on the left reminding you of a due task, the lamp on the right' }
  },
  robot: {
    button: 'Ask Budkin: open the table of contents',
    title: 'What would you like to know?',
    greeting: 'Hi there! Click me for the table of contents.'
  },
  sections: [
    {
      id: 'what',
      question: 'What is Budkin?',
      answer:
        'A task manager for your computer whose interface is a 3D desk. Instead of a window full of tables, you sit at a desk: your tasks live on the monitor in the middle, a robot on the left keeps time, and a lamp on the right switches between light and dark.',
      points: [
        { title: 'Monitor in the middle', text: 'its screen is where you manage tasks: lists, Kanban, calendar. Crisp text, and typing works as usual.' },
        { title: 'Robot on the left', text: 'always follows your cursor and speaks up when a task is coming up or due.' },
        { title: 'Desk lamp on the right', text: 'lamp on is dusk, lamp off is a blackout at night.' },
        { title: 'English and Vietnamese', text: 'switch languages right at the bottom of the sidebar.' }
      ],
      shot: { src: 'desk-day.png', alt: 'The Budkin desk with the lamp on: robot, task list on the monitor, desk lamp' }
    },
    {
      id: 'tasks',
      question: 'How do I manage tasks?',
      answer:
        'Write tasks in a list, drag cards around a Kanban board or lay them out on a calendar. Every task can have a due date, a time, a reminder, a priority, a project, tags, a checklist and notes.',
      points: [
        { title: 'Lists', text: 'Today, Upcoming, Overdue, All tasks, Completed; projects and tags in the sidebar.' },
        { title: 'Kanban', text: 'three columns, To do, In progress, Completed, with mouse or keyboard drag and drop. Drop a card on "Completed" and the robot celebrates.' },
        { title: 'Month and week calendar', text: 'drag a task to another day to change its due date; its reminder moves with it.' },
        {
          title: 'Repeating tasks',
          text: 'daily, weekdays, weekly, monthly, yearly or custom. Finish one and the next one appears on its own, with an Undo button.'
        },
        { title: 'Search without accents', text: 'type "bao cao" and still find "Báo cáo". Press N to add a task, / to search, 1 · 2 · 3 to switch views.' }
      ],
      shot: { src: 'kanban.png', alt: 'Kanban board with three columns: To do, In progress, Done', label: 'Kanban' },
      inset: { src: 'calendar.png', alt: 'Month calendar with tasks laid out by day', label: 'Calendar' }
    },
    {
      id: 'robot',
      question: 'How does the robot remind me?',
      answer:
        'When the time comes, the robot raises the alarm: a red light, a little bounce, a beep and a speech bubble right next to the monitor. You answer in the bubble itself, without opening the task.',
      points: [
        { title: 'Done · 10 min · Open', text: 'mark it done, get reminded again in 10 minutes, or open the task.' },
        { title: 'Remind ahead as you like', text: 'on time, or a few minutes, hours or days before. All-day tasks remind you at 9:00 (adjustable).' },
        { title: 'Busy in another app', text: 'you also get a system notification; several tasks at once are grouped into one.' },
        { title: 'Runs in the background', text: 'close the window and Budkin stays in the tray to remind you on time. Click the robot for a summary of today.' },
        { title: 'Barely uses your computer', text: 'the scene only redraws when something changes; leave it alone and the robot falls asleep and the whole window stops redrawing.' }
      ],
      shot: {
        src: 'desk-night.png',
        alt: 'The Budkin robot showing a "Due · today" bubble with Done, 10 min and Open buttons',
        crop: { x: 0, y: 0.25, w: 0.355, h: 0.6 }
      }
    },
    {
      id: 'robots',
      question: 'Which robots are there?',
      answer:
        'Five robots, each with its own personality: shape, animations, voice and lines. Click the round pedestal to switch: the old robot spins and sinks down, the new one rises up to say hello.',
      points: [
        { title: 'Budkin', text: 'a cheerful robot on wheels: squashes and stretches when poked, hops and spins around to celebrate.' },
        { title: 'Orbi', text: 'a calm floating orb with a single lens eye; speaks in short sentences with a bell-like "bloop".' },
        { title: 'Rover', text: 'an eager tracked rover with a periscope; talks like a field report.' },
        { title: 'Miu', text: 'a playful robot cat: perks up its ears when your cursor comes close, curls its tail to sleep, says "Meow~".' },
        { title: 'Mech', text: 'a serious two-legged mech: salutes when poked, reports "Checked: …".' }
      ]
    },
    {
      id: 'lamp',
      question: 'What is the lamp for?',
      answer:
        'The desk lamp is the theme switch. Click it (or press Ctrl+Shift+L) to change between two scenes: the whole room lights up or goes dark with it.',
      points: [
        { title: 'Lamp on', text: 'dusk under a warm white LED, a concrete wall and a ruined city outside the window.' },
        { title: 'Lamp off', text: 'a blackout at night: only the monitor, the keyboard backlight and the robot’s eyes glow.' },
        { title: 'Remembers your choice', text: 'the first time, Budkin follows your system’s light or dark mode; after that it stays the way you left it.' }
      ],
      shot: { src: 'desk-night.png', alt: 'The desk with the lamp off', label: 'Lamp off' },
      inset: { src: 'desk-day.png', alt: 'The desk with the lamp on', label: 'Lamp on' }
    },
    {
      id: 'claude',
      question: 'Can I ask Claude about my tasks?',
      answer:
        'Yes. Connect Budkin to Claude Desktop or Claude Code and chat as usual; Claude reads and edits your tasks in Budkin for you. It uses the Claude account you already have: Budkin never calls an AI by itself, needs no API key and costs nothing extra.',
      points: [
        { title: 'Ask and assign in plain words', text: '"what do I have today?", "add a task to call mom at 8 pm tomorrow", "move my overdue tasks to Monday".' },
        { title: 'One button to set up', text: 'Settings → AI connection → Connect. Other AI apps that support MCP work too.' },
        { title: 'You stay in control', text: 'Off, View only, or View and edit. Every change Claude makes comes with an Undo button for 15 minutes.' },
        { title: 'Budkin closed?', text: 'when Claude needs to read or change tasks, Budkin starts in the background and answers.' }
      ],
      shot: { src: 'desk-ai.png', alt: 'Claude has just added two tasks to Budkin, with a notification that has an Undo button' },
      inset: { src: 'settings-ai.png', alt: 'Settings → AI connection: Claude Desktop connected with View and edit access', label: 'AI connection' }
    },
    {
      id: 'data',
      question: 'Where is my data stored?',
      answer: 'Only on your computer. No account, no server, nothing sent anywhere, unless you connect Claude yourself to ask about your tasks.',
      points: [
        { title: 'Automatic backups', text: 'one a day, the last 7 days kept; restoring takes a single click.' },
        { title: 'Moving to another computer', text: 'export everything to one file and import it on the new one: merge with what is there or replace it.' },
        { title: 'Uninstalling keeps your tasks', text: 'your data stays, so reinstalling brings everything back.' }
      ],
      shot: { src: 'settings.png', alt: 'Settings → Data: export, import, the list of daily backups' }
    },
    {
      id: 'light',
      question: 'Does it run on a modest computer?',
      answer:
        'Yes. Without a graphics card, with a GPU that keeps failing, or when you choose 2D only, the whole desk is redrawn as vector art in the same style and layout as the 3D one.',
      points: [
        { title: 'All 5 robots are still there', text: 'they follow your cursor, blink, raise the alarm, celebrate and sleep with a "Zzz".' },
        { title: 'Much lighter', text: 'moving the mouse non-stop takes about a third of one CPU core; left alone it uses almost nothing.' },
        { title: 'Switches by itself', text: 'without WebGL, or if the 3D scene fails, Budkin uses the 2D desk automatically.' }
      ],
      shot: { src: 'desk-2d-night.png', alt: 'The 2D desk with the lamp off', label: 'Lamp off' },
      inset: { src: 'desk-2d-day.png', alt: 'The 2D desk with the lamp on', label: 'Lamp on' }
    },
    {
      id: 'install',
      question: 'Which computers does it run on?',
      answer: 'Windows, macOS and Ubuntu; other Linux distributions run the AppImage. Installers are on the GitHub releases page.',
      platforms: [
        {
          title: 'Windows 10 / 11',
          text: 'Run Budkin-Setup; no administrator rights needed. The installer is not signed yet, so SmartScreen may block it the first time: click More info, then Run anyway.'
        },
        {
          title: 'macOS 13 or later',
          text: 'Apple silicon Macs use the arm64 build, Intel Macs the x64 one. Drag Budkin to Applications; the first time you open it, go to System Settings → Privacy & Security → Open Anyway.'
        },
        { title: 'Ubuntu 24.04 or later', text: 'Install the .deb with sudo apt install ./budkin_x.y.z_amd64.deb, then open Budkin from your applications.' },
        { title: 'Other Linux', text: 'Use the AppImage: make it executable (chmod +x) and run it, nothing else to install.' }
      ]
    },
    {
      id: 'price',
      question: 'Does it cost anything?',
      answer:
        'No. Budkin is free and open source under the MIT license: use it, change it, share it. Connecting Claude costs nothing extra either, because Budkin uses the Claude account you already have.'
    }
  ],
  footer: {
    tagline: 'A desk with a robot that reminds you.',
    license: 'Free and open source under the MIT license.',
    madeBy: 'Hoang Duong'
  }
}

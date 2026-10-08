import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { Task, Note, SmartNotification } from './src/types';
import { parseVietnameseTaskPrompt } from './src/utils/offlineNlpEngine';
import {
  breakdownTaskOffline,
  generateDailyBriefingOffline,
  enhanceNoteOffline,
  askPlanningAdvisorOffline,
} from './src/utils/offlineSmartEngine';

dotenv.config();

process.on('uncaughtException', (err) => {
  console.error('[Server Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server Unhandled Rejection]', reason);
});

const __filenameResolved = typeof __filename !== 'undefined' ? __filename : '';
const __dirnameResolved = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '20mb' }));

// --- Local File Database Configuration ---
function getDataDir(): string {
  if (process.env.NODE_ENV !== 'production') {
    const localData = path.join(process.cwd(), 'data');
    if (!fs.existsSync(localData)) {
      try { fs.mkdirSync(localData, { recursive: true }); } catch {}
    }
    return localData;
  }
  const userAppData = process.env.APPDATA || (process.platform === 'darwin' ? (process.env.HOME || '') + '/Library/Preferences' : '/var/local');
  const appDataFlowSync = path.join(userAppData, 'flowsync-data');
  if (!fs.existsSync(appDataFlowSync)) {
    try { fs.mkdirSync(appDataFlowSync, { recursive: true }); } catch {}
  }
  return appDataFlowSync;
}

const DATA_DIR = getDataDir();
const DB_FILE = path.join(DATA_DIR, 'flowsync_db.json');

const now = new Date();
const todayStr = now.toISOString().split('T')[0];
const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const tomorrowStr = tomorrow.toISOString().split('T')[0];

let initialSampleTasks: Task[] = [
  {
    id: 'task-1',
    title: 'Hoàn thiện bản báo cáo tiến độ tuần',
    description: 'Tổng hợp số liệu KPI, biểu đồ năng suất và kế hoạch sprint tiếp theo gửi trưởng phòng.',
    status: 'in_progress',
    priority: 'urgent',
    category: 'work',
    dueDate: `${todayStr}T17:30`,
    reminderTime: `${todayStr}T16:30`,
    reminderMinutesBefore: 60,
    tags: ['Báo cáo', 'Quan trọng', 'Sprint'],
    subtasks: [
      { id: 'sub-1', title: 'Thu thập số liệu từ đội ngũ phát triển', completed: true },
      { id: 'sub-2', title: 'Vẽ biểu đồ so sánh KPI tháng trước', completed: true },
      { id: 'sub-3', title: 'Soạn thảo phần kết luận & kiến nghị', completed: false },
    ],
    estimatedMinutes: 90,
    smartSuggestion: 'Nên hoàn thành trước 16:30 để có 1 giờ rà soát lỗi chính tả và format lại bảng biểu.',
    isStarred: true,
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-2',
    title: 'Họp chuẩn bị chiến dịch ra mắt sản phẩm mới',
    description: 'Thảo luận với bộ phận Marketing và UI/UX về timeline phát hành tính năng.',
    status: 'todo',
    priority: 'high',
    category: 'work',
    dueDate: `${todayStr}T14:00`,
    reminderTime: `${todayStr}T13:45`,
    reminderMinutesBefore: 15,
    tags: ['Họp', 'Marketing', 'Release'],
    subtasks: [
      { id: 'sub-4', title: 'Chuẩn bị tài liệu slide trình bày', completed: false },
      { id: 'sub-5', title: 'Gửi link Google Meet cho các bên liên quan', completed: true },
    ],
    estimatedMinutes: 45,
    smartSuggestion: 'Kiểm tra mic và kết nối trước 5 phút để tránh trục trặc kỹ thuật.',
    isStarred: false,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-3',
    title: 'Thanh toán tiền điện & Internet hàng tháng',
    description: 'Kiểm tra hóa đơn trên app ngân hàng và thanh toán tự động.',
    status: 'todo',
    priority: 'medium',
    category: 'finance',
    dueDate: `${tomorrowStr}T20:00`,
    reminderTime: `${tomorrowStr}T09:00`,
    reminderMinutesBefore: 660,
    tags: ['Hóa đơn', 'Tài chính'],
    subtasks: [],
    estimatedMinutes: 10,
    isStarred: false,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-4',
    title: 'Chạy bộ 5km rèn luyện sức bền',
    description: 'Chạy công viên hoặc máy chạy bộ buổi chiều tối, uống đủ 2L nước.',
    status: 'completed',
    priority: 'low',
    category: 'health',
    dueDate: `${todayStr}T19:00`,
    tags: ['Sức khỏe', 'Thể thao'],
    subtasks: [
      { id: 'sub-6', title: 'Khởi động 10 phút', completed: true },
      { id: 'sub-7', title: 'Chạy cự ly 5km tốc độ vừa', completed: true },
    ],
    estimatedMinutes: 40,
    completedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    isStarred: false,
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-5',
    title: 'Đọc 2 chương sách Thiết kế Tư duy (Design Thinking)',
    description: 'Ghi chú lại 3 ý tưởng có thể áp dụng vào dự án hiện tại.',
    status: 'todo',
    priority: 'low',
    category: 'study',
    dueDate: `${tomorrowStr}T22:00`,
    tags: ['Học tập', 'Sách'],
    subtasks: [],
    estimatedMinutes: 60,
    isStarred: true,
    createdAt: new Date(Date.now() - 3600000 * 30).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let initialSampleNotes: Note[] = [
  {
    id: 'note-1',
    title: '💡 Ý tưởng cải tiến trải nghiệm người dùng',
    content: '- Thêm phím tắt nhanh Ctrl+K để tìm kiếm tức thì\n- Tự động gợi ý mức độ ưu tiên theo từ khóa như "khẩn cấp", "ngay lập tức"\n- Chạy offline 100% không lo mất mạng',
    color: 'amber',
    category: 'work',
    tags: ['UX', 'Ý tưởng', 'Tính năng'],
    isPinned: true,
    checklist: [
      { id: 'chk-1', text: 'Tối ưu bảng màu ấm áp, bảo vệ mắt', done: true },
      { id: 'chk-2', text: 'Tích hợp âm thanh nhắc nhở du dương Web Audio', done: true },
      { id: 'chk-3', text: 'Thêm bộ xử lý tiếng Việt NLP bóc tách công việc', done: true },
    ],
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'note-2',
    title: '🛒 Danh sách đồ cần mua cuối tuần',
    content: 'Chuẩn bị thực phẩm cho tuần tới và đồ dùng gia đình.',
    color: 'emerald',
    category: 'shopping',
    tags: ['Mua sắm', 'Gia đình'],
    isPinned: false,
    checklist: [
      { id: 'chk-4', text: 'Cà phê nguyên hạt Robusta & Arabica', done: true },
      { id: 'chk-5', text: 'Rau củ hữu cơ & hoa quả tươi', done: false },
      { id: 'chk-6', text: 'Sữa chua không đường và yến mạch', done: false },
    ],
    createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'note-3',
    title: '📚 Ghi chép khóa học Quản trị Thời gian',
    content: 'Quy tắc 2 phút: Việc gì làm dưới 2 phút hãy làm ngay.\nMa trận Eisenhower: Phân loại theo Khẩn cấp vs Quan trọng.\nPhương pháp Pomodoro: 25 phút tập trung cao độ + 5 phút nghỉ ngơi.',
    color: 'indigo',
    category: 'study',
    tags: ['Năng suất', 'Học tập'],
    isPinned: true,
    checklist: [],
    createdAt: new Date(Date.now() - 3600000 * 96).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let initialSampleNotifications: SmartNotification[] = [
  {
    id: 'notif-1',
    type: 'deadline_urgent',
    title: 'Sắp đến hạn báo cáo',
    message: 'Công việc "Hoàn thiện bản báo cáo tiến độ tuần" hết hạn lúc 17:30 hôm nay!',
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    read: false,
    taskId: 'task-1',
    priority: 'critical',
    actionLabel: 'Xem chi tiết',
  },
  {
    id: 'notif-2',
    type: 'ai_insight',
    title: 'Trợ lý Năng suất Offline',
    message: 'Bạn có các công việc quan trọng cần hoàn thành hôm nay. Hãy ưu tiên cuộc họp và báo cáo trước!',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    read: false,
    priority: 'high',
  },
  {
    id: 'notif-3',
    type: 'system_sync',
    title: 'Chế độ Desktop PC Offline Sẵn sàng',
    message: 'Hệ thống đã lưu trữ dữ liệu an toàn trên ổ đĩa máy tính. 100% không cần kết nối mạng.',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    read: true,
    priority: 'low',
  }
];

let tasks: Task[] = [];
let notes: Note[] = [];
let notifications: SmartNotification[] = [];
let syncVersion = 1;

// Hàm tải dữ liệu từ file JSON cục bộ
function loadDatabaseFromFile() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(content);
      tasks = Array.isArray(data.tasks) ? data.tasks : initialSampleTasks;
      notes = Array.isArray(data.notes) ? data.notes : initialSampleNotes;
      notifications = Array.isArray(data.notifications) ? data.notifications : initialSampleNotifications;
      syncVersion = typeof data.syncVersion === 'number' ? data.syncVersion : 1;
      console.log(`[Storage] Đã tải thành công ${tasks.length} công việc và ${notes.length} ghi chú từ file: ${DB_FILE}`);
    } else {
      tasks = initialSampleTasks;
      notes = initialSampleNotes;
      notifications = initialSampleNotifications;
      saveDatabaseToFile();
      console.log(`[Storage] Đã khởi tạo cơ sở dữ liệu mẫu ban đầu tại: ${DB_FILE}`);
    }
  } catch (err) {
    console.error('[Storage Error] Lỗi đọc cơ sở dữ liệu, sử dụng bộ nhớ mẫu:', err);
    tasks = initialSampleTasks;
    notes = initialSampleNotes;
    notifications = initialSampleNotifications;
  }
}

// Hàm ghi dữ liệu vào file JSON cục bộ
function saveDatabaseToFile() {
  try {
    const payload = {
      tasks,
      notes,
      notifications,
      syncVersion,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Storage Error] Không thể ghi file cơ sở dữ liệu cục bộ:', err);
  }
}

loadDatabaseFromFile();

// Server-Sent Events (SSE) Clients Management
type SSEClient = {
  id: string;
  res: express.Response;
};
const sseClients: SSEClient[] = [];

function broadcastRealtimeEvent(eventType: string, payload: any) {
  syncVersion++;
  saveDatabaseToFile();

  const data = JSON.stringify({
    type: eventType,
    payload,
    version: syncVersion,
    timestamp: new Date().toISOString(),
    connectedCount: sseClients.length,
  });

  sseClients.forEach((client) => {
    try {
      client.res.write(`event: sync\ndata: ${data}\n\n`);
    } catch {
      // client disconnected
    }
  });
}

// Lazy Initialize Gemini API Client (Tùy chọn nếu người dùng có API Key, nếu không sẽ dùng Offline Smart Engine 100%)
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && process.env.GEMINI_API_KEY) {
    try {
      geminiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } catch {
      geminiClient = null;
    }
  }
  return geminiClient;
}

// --- SSE Endpoint ---
app.get('/api/sync/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  sseClients.push({ id: clientId, res });

  res.write(
    `event: connected\ndata: ${JSON.stringify({
      clientId,
      version: syncVersion,
      connectedCount: sseClients.length,
      timestamp: new Date().toISOString(),
    })}\n\n`
  );

  broadcastRealtimeEvent('client_joined', { clientCount: sseClients.length });

  req.on('close', () => {
    const index = sseClients.findIndex((c) => c.id === clientId);
    if (index !== -1) {
      sseClients.splice(index, 1);
      broadcastRealtimeEvent('client_left', { clientCount: sseClients.length });
    }
  });
});

// --- Tasks CRUD ---
app.get('/api/tasks', (req, res) => {
  res.json({ tasks, version: syncVersion });
});

app.post('/api/tasks', (req, res) => {
  const newTask: Task = {
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    title: req.body.title || 'Công việc mới',
    description: req.body.description || '',
    status: req.body.status || 'todo',
    priority: req.body.priority || 'medium',
    category: req.body.category || 'work',
    dueDate: req.body.dueDate,
    reminderTime: req.body.reminderTime,
    reminderMinutesBefore: req.body.reminderMinutesBefore ?? 15,
    tags: Array.isArray(req.body.tags) ? req.body.tags : [],
    subtasks: Array.isArray(req.body.subtasks) ? req.body.subtasks : [],
    estimatedMinutes: req.body.estimatedMinutes,
    smartSuggestion: req.body.smartSuggestion,
    isStarred: !!req.body.isStarred,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  tasks.unshift(newTask);
  broadcastRealtimeEvent('task_created', newTask);
  res.status(201).json(newTask);
});

app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Không tìm thấy công việc' });
  }

  const prevTask = tasks[index];
  const updatedTask: Task = {
    ...prevTask,
    ...req.body,
    id: prevTask.id,
    updatedAt: new Date().toISOString(),
    completedAt:
      req.body.status === 'completed' && prevTask.status !== 'completed'
        ? new Date().toISOString()
        : req.body.status !== 'completed'
        ? undefined
        : prevTask.completedAt,
  };

  tasks[index] = updatedTask;
  broadcastRealtimeEvent('task_updated', updatedTask);
  res.json(updatedTask);
});

app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Không tìm thấy công việc' });
  }

  tasks.splice(index, 1);
  broadcastRealtimeEvent('task_deleted', { id });
  res.json({ success: true, deletedId: id });
});

// --- Notes CRUD ---
app.get('/api/notes', (req, res) => {
  res.json({ notes, version: syncVersion });
});

app.post('/api/notes', (req, res) => {
  const newNote: Note = {
    id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    title: req.body.title || 'Ghi chú mới',
    content: req.body.content || '',
    color: req.body.color || 'amber',
    category: req.body.category || 'work',
    tags: Array.isArray(req.body.tags) ? req.body.tags : [],
    isPinned: !!req.body.isPinned,
    checklist: Array.isArray(req.body.checklist) ? req.body.checklist : [],
    linkedTaskId: req.body.linkedTaskId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  notes.unshift(newNote);
  broadcastRealtimeEvent('note_created', newNote);
  res.status(201).json(newNote);
});

app.put('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const index = notes.findIndex((n) => n.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Không tìm thấy ghi chú' });
  }

  const prevNote = notes[index];
  const updatedNote: Note = {
    ...prevNote,
    ...req.body,
    id: prevNote.id,
    updatedAt: new Date().toISOString(),
  };

  notes[index] = updatedNote;
  broadcastRealtimeEvent('note_updated', updatedNote);
  res.json(updatedNote);
});

app.delete('/api/notes/:id', (req, res) => {
  const { id } = req.params;
  const index = notes.findIndex((n) => n.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Không tìm thấy ghi chú' });
  }

  notes.splice(index, 1);
  broadcastRealtimeEvent('note_deleted', { id });
  res.json({ success: true, deletedId: id });
});

// --- Notifications ---
app.get('/api/notifications', (req, res) => {
  res.json({ notifications });
});

app.post('/api/notifications', (req, res) => {
  const newNotif: SmartNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    type: req.body.type || 'reminder_upcoming',
    title: req.body.title || 'Thông báo mới',
    message: req.body.message || '',
    timestamp: new Date().toISOString(),
    read: false,
    taskId: req.body.taskId,
    priority: req.body.priority || 'normal',
    actionLabel: req.body.actionLabel,
  };

  notifications.unshift(newNotif);
  broadcastRealtimeEvent('notification_created', newNotif);
  res.status(201).json(newNotif);
});

app.post('/api/notifications/mark-read', (req, res) => {
  const { id, all } = req.body;
  if (all) {
    notifications.forEach((n) => (n.read = true));
  } else if (id) {
    const notif = notifications.find((n) => n.id === id);
    if (notif) notif.read = true;
  }
  broadcastRealtimeEvent('notifications_read', { id, all });
  res.json({ success: true });
});

app.post('/api/notifications/clear', (req, res) => {
  notifications = [];
  broadcastRealtimeEvent('notifications_cleared', {});
  res.json({ success: true });
});

// --- Backup & Restore Endpoints ---
app.get('/api/backup/export', (req, res) => {
  res.json({
    app: 'FlowSync Desktop Offline',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    tasks,
    notes,
    notifications,
  });
});

app.post('/api/backup/import', (req, res) => {
  try {
    const { tasks: importedTasks, notes: importedNotes, notifications: importedNotifs } = req.body;
    if (Array.isArray(importedTasks)) tasks = importedTasks;
    if (Array.isArray(importedNotes)) notes = importedNotes;
    if (Array.isArray(importedNotifs)) notifications = importedNotifs;

    syncVersion++;
    saveDatabaseToFile();
    broadcastRealtimeEvent('database_restored', {
      tasksCount: tasks.length,
      notesCount: notes.length,
    });

    res.json({
      success: true,
      message: 'Khôi phục dữ liệu thành công',
      tasksCount: tasks.length,
      notesCount: notes.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể nhập dữ liệu: ' + err.message });
  }
});

// --- Smart Intelligence Endpoints (100% Offline with Local Engine) ---

// 1. Parse natural language prompt into structured task
app.post('/api/gemini/parse-prompt', async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Nội dung prompt không hợp lệ' });
  }

  // Chạy ngay bộ máy NLP Tiếng Việt Offline
  const parsedOffline = parseVietnameseTaskPrompt(text);

  const ai = getGeminiClient();
  if (!ai) {
    return res.json({ task: parsedOffline });
  }

  try {
    const prompt = `Bạn là trợ lý ảo bóc tách công việc thông minh tiếng Việt.
Hôm nay là: ${new Date().toISOString()}.
Hãy phân tích câu lệnh: "${text}"
Trả về JSON với cấu trúc chuẩn:
{
  "title": "Tiêu đề công việc ngắn gọn (tiếng Việt)",
  "description": "Mô tả chi tiết",
  "priority": "low" | "medium" | "high" | "urgent",
  "category": "work" | "personal" | "study" | "finance" | "health" | "shopping" | "other",
  "dueDate": "YYYY-MM-DDTHH:mm",
  "reminderMinutesBefore": 15,
  "estimatedMinutes": 30,
  "tags": ["tag1", "tag2"],
  "subtasks": ["bước 1", "bước 2"],
  "smartSuggestion": "Lời khuyên"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const structuredSubtasks = (parsed.subtasks || []).map((st: string, idx: number) => ({
      id: `sub-${Date.now()}-${idx}`,
      title: st,
      completed: false,
    }));

    res.json({
      task: {
        ...parsedOffline,
        ...parsed,
        subtasks: structuredSubtasks.length > 0 ? structuredSubtasks : parsedOffline.subtasks,
      },
    });
  } catch (err: any) {
    // Trả về kết quả từ bộ máy NLP Offline
    res.json({ task: parsedOffline });
  }
});

// 2. Breakdown task into actionable subtasks with time estimates
app.post('/api/gemini/breakdown-task', async (req, res) => {
  const { title, description, category } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Cần tiêu đề công việc' });
  }

  // Phân rã ngoại tuyến ngay lập tức
  const offlineResult = breakdownTaskOffline(title, description, category);

  const ai = getGeminiClient();
  if (!ai) {
    return res.json(offlineResult);
  }

  try {
    const prompt = `Phân rã công việc: "${title}" (${description || ''}) thành 3-5 bước thực hiện.
Trả về JSON: { "subtasks": [{ "title": "...", "estimatedMinutes": 20 }], "smartSuggestion": "..." }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    const resultSubtasks = (parsed.subtasks || []).map((st: any, i: number) => ({
      id: `sub-${Date.now()}-${i}`,
      title: st.title,
      completed: false,
      estimatedMinutes: st.estimatedMinutes || 15,
    }));

    res.json({
      subtasks: resultSubtasks.length > 0 ? resultSubtasks : offlineResult.subtasks,
      smartSuggestion: parsed.smartSuggestion || offlineResult.smartSuggestion,
    });
  } catch {
    res.json(offlineResult);
  }
});

// 3. Daily AI Briefing & Smart Notification Insight
app.post('/api/gemini/daily-briefing', async (req, res) => {
  const currentTasks = tasks;
  const offlineBriefing = generateDailyBriefingOffline(currentTasks);

  const ai = getGeminiClient();
  if (!ai) {
    return res.json({ briefing: offlineBriefing });
  }

  try {
    const taskSummary = currentTasks.slice(0, 15).map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
    }));

    const prompt = `Phân tích kế hoạch ngày với các công việc: ${JSON.stringify(taskSummary)}
Trả về JSON: { "greeting": "...", "summary": "...", "productivityScore": 85, "topPriorities": ["..."], "timeWarnings": ["..."], "smartTip": "..." }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ briefing: { ...offlineBriefing, ...parsed } });
  } catch {
    res.json({ briefing: offlineBriefing });
  }
});

// 4. Enhance Note with AI
app.post('/api/gemini/enhance-note', async (req, res) => {
  const { title, content } = req.body;
  const offlineNoteResult = enhanceNoteOffline(title || '', content || '');

  const ai = getGeminiClient();
  if (!ai) {
    return res.json(offlineNoteResult);
  }

  try {
    const prompt = `Tối ưu ghi chú: "${title}"\n${content}\nTrả về JSON: { "enhancedTitle": "...", "enhancedContent": "...", "suggestedChecklist": ["..."], "suggestedTags": ["..."] }`;
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ ...offlineNoteResult, ...parsed });
  } catch {
    res.json(offlineNoteResult);
  }
});

// 5. Ask AI Planning & Advisor
app.post('/api/ai/ask', async (req, res) => {
  const { prompt, tasksContext } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Thiếu câu hỏi prompt' });
  }

  const adviceOffline = askPlanningAdvisorOffline(prompt, tasksContext || tasks);

  const ai = getGeminiClient();
  if (!ai) {
    return res.json(adviceOffline);
  }

  try {
    const aiPrompt = `Người dùng hỏi: "${prompt}". Bối cảnh công việc: ${JSON.stringify((tasksContext || tasks).slice(0, 5))}.
Trả lời súc tích 2-3 câu bằng tiếng Việt và đề xuất công việc nếu có.
JSON: { "reply": "...", "actionSuggestion": { "title": "...", "priority": "high", "category": "work", "dueDate": "..." } }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: aiPrompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ ...adviceOffline, ...parsed });
  } catch {
    res.json(adviceOffline);
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'desktop_offline',
    time: new Date().toISOString(),
    syncVersion,
    tasksCount: tasks.length,
    notesCount: notes.length,
  });
});

// Vite Middleware Integration or Production Serve
async function startServer() {
  if (process.env.NODE_ENV === 'development') {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch {
      serveStaticBundle();
    }
  } else {
    serveStaticBundle();
  }

  function serveStaticBundle() {
    let distPath = path.join(__dirnameResolved, 'dist');
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      if (fs.existsSync(path.join(__dirnameResolved, 'index.html'))) {
        distPath = __dirnameResolved;
      } else if (fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'))) {
        distPath = path.join(process.cwd(), 'dist');
      } else if (fs.existsSync(path.join(__dirnameResolved, '..', 'dist', 'index.html'))) {
        distPath = path.join(__dirnameResolved, '..', 'dist');
      }
    }
    console.log(`[Server] Phục vụ giao diện tĩnh từ: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('FlowSync UI not found in dist/');
      }
    });
  }

  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 FlowSync Desktop Server running on http://127.0.0.1:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Server] Port ${PORT} đã được sử dụng bởi phiên bản trước, tiếp tục với máy chủ hiện hữu.`);
    } else {
      console.error('[Server Error]', err);
    }
  });
}

startServer();

import { useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Copy,
  Edit3,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  KitchenStation,
  PlannerPriority,
  PlannerStatus,
  PlannerTask,
  PlannerTaskType,
} from '../types';
import {
  clampStr,
  formatDateShort,
  offsetDateISO,
  todayISO,
} from '../utils/format';

interface PlannerModuleProps {
  ownerId: string;
  plannerTasks: PlannerTask[];
}

const STATIONS: KitchenStation[] = [
  'Dosa & Tawa',
  'Batter & Grinding',
  'Sambar & Chutneys',
  'Filter Coffee',
  'Procurement & Floor',
];

const TASK_TYPES: PlannerTaskType[] = [
  'Batter Prep',
  'Shift Roster',
  'Vendor Delivery',
  'Catering Prep',
  'Maintenance',
];

const QUICK_PRESETS = [
  {
    title: 'Soak Idli Rice & Urad Dal (Overnight Batch)',
    station: 'Batter & Grinding' as KitchenStation,
    taskType: 'Batter Prep' as PlannerTaskType,
    scheduledTime: '09:30',
    notes: '4:1 rice-to-urad ratio with fenugreek; grind at 14:30.',
  },
  {
    title: 'Fresh Coconut & Roasted Gram Chutney Prep',
    station: 'Sambar & Chutneys' as KitchenStation,
    taskType: 'Batter Prep' as PlannerTaskType,
    scheduledTime: '06:00',
    notes: 'Temper mustard, urad dal, dried red chilli, and curry leaves.',
  },
  {
    title: 'First-Press Madras Coffee Decoction Brew',
    station: 'Filter Coffee' as KitchenStation,
    taskType: 'Shift Roster' as PlannerTaskType,
    scheduledTime: '05:45',
    notes: '80:20 Arabica-Chicory blend in brass percolators.',
  },
];

export function PlannerModule({ ownerId, plannerTasks }: PlannerModuleProps) {
  const [stationFilter, setStationFilter] = useState<'All' | KitchenStation>('All');
  const [statusFilter, setStatusFilter] = useState<'all' | PlannerStatus>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannerTask | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [station, setStation] = useState<KitchenStation>('Batter & Grinding');
  const [taskType, setTaskType] = useState<PlannerTaskType>('Batter Prep');
  const [scheduledDate, setScheduledDate] = useState(todayISO());
  const [scheduledTime, setScheduledTime] = useState('06:30');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState<PlannerPriority>('high');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<PlannerStatus>('planned');

  const plannedCount = plannerTasks.filter((t) => t.status === 'planned').length;
  const inProgressCount = plannerTasks.filter((t) => t.status === 'in_progress').length;
  const completedCount = plannerTasks.filter((t) => t.status === 'completed').length;

  const filtered = [...plannerTasks]
    .sort((a, b) => `${a.scheduledDate} ${a.scheduledTime}`.localeCompare(`${b.scheduledDate} ${b.scheduledTime}`))
    .filter((t) => {
      const matchesStation = stationFilter === 'All' || t.station === stationFilter;
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      return matchesStation && matchesStatus;
    });

  // Group by scheduledDate
  const groupedByDate = filtered.reduce<Record<string, PlannerTask[]>>((acc, task) => {
    const key = task.scheduledDate || todayISO();
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});

  const openCreate = (preset?: (typeof QUICK_PRESETS)[number]) => {
    setEditingTask(null);
    setTitle(preset?.title || '');
    setStation(preset?.station || 'Batter & Grinding');
    setTaskType(preset?.taskType || 'Batter Prep');
    setScheduledDate(todayISO());
    setScheduledTime(preset?.scheduledTime || '07:00');
    setAssignee('');
    setPriority('high');
    setNotes(preset?.notes || '');
    setStatus('planned');
    setModalOpen(true);
  };

  const openEdit = (task: PlannerTask) => {
    setEditingTask(task);
    setTitle(task.title);
    setStation(task.station);
    setTaskType(task.taskType);
    setScheduledDate(task.scheduledDate);
    setScheduledTime(task.scheduledTime);
    setAssignee(task.assignee);
    setPriority(task.priority);
    setNotes(task.notes);
    setStatus(task.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = clampStr(title, 160);
    if (!cleanTitle) return;

    const payload = {
      ownerId,
      title: cleanTitle,
      station,
      taskType,
      scheduledDate: clampStr(scheduledDate, 20) || todayISO(),
      scheduledTime: clampStr(scheduledTime, 20) || '08:00',
      assignee: clampStr(assignee, 80),
      priority,
      notes: clampStr(notes, 400),
      status,
      updatedAt: serverTimestamp(),
    };

    setSaving(true);
    try {
      if (editingTask) {
        await updateDoc(doc(db, 'plannerTasks', editingTask.id), payload);
      } else {
        const ref = doc(collection(db, 'plannerTasks'));
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setModalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingTask ? OperationType.UPDATE : OperationType.CREATE,
        'plannerTasks'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAdvanceStatus = async (task: PlannerTask, nextStatus: PlannerStatus) => {
    try {
      await updateDoc(doc(db, 'plannerTasks', task.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `plannerTasks/${task.id}`);
    }
  };

  const handleDuplicateNextDay = async (task: PlannerTask) => {
    try {
      const ref = doc(collection(db, 'plannerTasks'));
      await setDoc(ref, {
        ownerId,
        title: task.title,
        station: task.station,
        taskType: task.taskType,
        scheduledDate: offsetDateISO(1),
        scheduledTime: task.scheduledTime,
        assignee: task.assignee,
        priority: task.priority,
        notes: task.notes,
        status: 'planned',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'plannerTasks');
    }
  };

  const handleDelete = async (task: PlannerTask) => {
    try {
      await deleteDoc(doc(db, 'plannerTasks', task.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `plannerTasks/${task.id}`);
    }
  };

  const formatDateHeading = (iso: string) => {
    if (iso === todayISO()) return `Today · ${formatDateShort(iso)}`;
    if (iso === offsetDateISO(1)) return `Tomorrow · ${formatDateShort(iso)}`;
    return formatDateShort(iso);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display tracking-tight">
            Kitchen, Batter &amp; Shift Planner
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Schedule overnight batter soaking, grinding shifts, tawa seasoning, vendor drops, and Sadhya catering prep.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openCreate()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Schedule Task
        </button>
      </div>

      {/* Summary & Quick Presets */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Planned Queue</div>
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">{plannedCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">In Progress (Active Batches)</div>
          <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums">{inProgressCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500 mb-1">Completed</div>
          <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums">{completedCount}</div>
        </div>
      </div>

      {/* Quick South Indian Kitchen Templates */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-700">Quick Kitchen Templates:</span>
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_PRESETS.map((preset) => (
            <button
              key={preset.title}
              type="button"
              onClick={() => openCreate(preset)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              + {preset.title}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['All', ...STATIONS] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStationFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                stationFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start lg:self-auto">
          {(['all', 'planned', 'in_progress', 'completed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === s ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {s === 'all'
                ? 'All'
                : s === 'planned'
                ? 'Planned'
                : s === 'in_progress'
                ? 'In Progress'
                : 'Completed'}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped Task Schedule */}
      {Object.keys(groupedByDate).length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          No tasks scheduled for the selected station and status.
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(groupedByDate).map(([dateKey, tasks]) => (
            <div key={dateKey} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">{formatDateHeading(dateKey)}</h2>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                </span>
              </div>

              <div className="divide-y divide-slate-200">
                {tasks.map((task) => {
                  const isCompleted = task.status === 'completed';
                  return (
                    <div
                      key={task.id}
                      className={`px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors ${
                        isCompleted ? 'opacity-65' : ''
                      }`}
                    >
                      <div className="flex items-start gap-4 min-w-0">
                        <div className="font-mono tabular-nums text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-md shrink-0">
                          {task.scheduledTime}
                        </div>
                        <div className="min-w-0">
                          <div className={`text-sm font-semibold text-slate-900 ${isCompleted ? 'line-through text-slate-500' : ''}`}>
                            {task.title}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {task.station} · {task.taskType} · {task.assignee || 'Unassigned'} · Priority:{' '}
                            <span
                              className={
                                task.priority === 'high'
                                  ? 'text-red-700 font-medium'
                                  : task.priority === 'medium'
                                  ? 'text-amber-700 font-medium'
                                  : 'text-slate-600'
                              }
                            >
                              {task.priority}
                            </span>
                          </div>
                          {task.notes && (
                            <p className="text-xs text-slate-600 mt-1">{task.notes}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {task.status === 'planned' && (
                          <button
                            type="button"
                            onClick={() => handleAdvanceStatus(task, 'in_progress')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md cursor-pointer whitespace-nowrap"
                          >
                            <Play className="w-3.5 h-3.5" />
                            Start
                          </button>
                        )}
                        {task.status !== 'completed' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleAdvanceStatus(task, 'completed')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Complete
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(task)}
                              className="p-1.5 text-slate-500 hover:text-emerald-700 rounded-md hover:bg-slate-100 cursor-pointer"
                              title="Edit task"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {isCompleted && (
                          <button
                            type="button"
                            onClick={() => handleDuplicateNextDay(task)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer whitespace-nowrap"
                            title="Schedule same batch for tomorrow"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Repeat Tomorrow
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(task)}
                          className="p-1.5 text-slate-500 hover:text-red-700 rounded-md hover:bg-slate-100 cursor-pointer"
                          title="Delete task"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingTask ? 'Edit Kitchen Task' : 'Schedule Kitchen or Shift Task'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Grind 40kg Idli-Dosa Batter Batch"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kitchen Station</label>
                  <select
                    value={station}
                    onChange={(e) => setStation(e.target.value as KitchenStation)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {STATIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Task Type</label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value as PlannerTaskType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {TASK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Time</label>
                  <input
                    type="time"
                    required
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Assignee / Master</label>
                  <input
                    type="text"
                    maxLength={80}
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    placeholder="e.g., Mani Master"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as PlannerPriority)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Prep Instructions &amp; Notes</label>
                <input
                  type="text"
                  maxLength={400}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Soaking hours, temperature, or delivery verification notes"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'Saving...' : editingTask ? 'Save Task' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

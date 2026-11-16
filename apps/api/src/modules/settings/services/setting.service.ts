import { AuditLog } from '../models/auditLog.model.js';
import { Setting } from '../models/setting.model.js';

export async function listAllSettings(): Promise<Record<string, Record<string, unknown>>> {
  const items = await Setting.find().lean();
  return Object.fromEntries(items.map((item) => [item.key, item.value]));
}

export async function getSettingsByKeys(
  keys: string[],
): Promise<Record<string, Record<string, unknown>>> {
  const items = await Setting.find({ key: { $in: keys } }).lean();
  return Object.fromEntries(items.map((item) => [item.key, item.value]));
}

export async function upsertSetting(
  key: string,
  value: Record<string, unknown>,
  actor: { id: string; ip?: string },
) {
  const previous = await Setting.findOne({ key }).lean();
  const updated = await Setting.findOneAndUpdate(
    { key },
    { value },
    { new: true, upsert: true },
  ).lean();

  await AuditLog.create({
    actorId: actor.id,
    action: 'setting.updated',
    entity: 'Setting',
    entityId: key,
    before: previous?.value,
    after: value,
    ip: actor.ip,
  });

  return {
    key: updated.key,
    value: updated.value,
  };
}

export async function listAuditLogs(query: {
  action?: string;
  entity?: string;
  actorId?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  const filter: Record<string, unknown> = {};
  if (query.action) filter.action = query.action;
  if (query.entity) filter.entity = query.entity;
  if (query.actorId) filter.actorId = query.actorId;

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return {
    items: items.map((entry) => ({
      id: String(entry._id),
      actorId: entry.actorId ? String(entry.actorId) : undefined,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      ip: entry.ip,
    })),
    meta: { page, limit, total },
  };
}

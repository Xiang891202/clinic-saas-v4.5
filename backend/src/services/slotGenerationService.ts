// backend/src/services/slotGenerationService.ts
import { SupabaseClient } from "@supabase/supabase-js";

export class SlotGenerationService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 为所有租户生成未来 N 天的时段实例
   */
  async generateSlotsForAllTenants(daysAhead: number = 30) {
    // 获取所有活跃租户
    const { data: tenants, error: tenantErr } = await this.supabase
      .from("tenants")
      .select("id")
      .eq("status", "active");

    if (tenantErr) throw new Error(tenantErr.message);

    const results = [];
    for (const tenant of tenants || []) {
      try {
        const result = await this.generateSlotsForTenant(tenant.id, daysAhead);
        results.push({ tenantId: tenant.id, ...result });
      } catch (err) {
        results.push({ tenantId: tenant.id, error: (err as Error).message });
      }
    }

    return results;
  }

  /**
   * 为单个租户生成未来 N 天的时段实例
   */
  async generateSlotsForTenant(tenantId: string, daysAhead: number = 30) {
    // 1. 获取该租户的所有排班模板
    const { data: templates, error: templateErr } = await this.supabase
      .from("booking_slots")
      .select("*")
      .eq("tenant_id", tenantId);

    if (templateErr) throw new Error(templateErr.message);
    if (!templates || templates.length === 0) {
      return { generated: 0, skipped: 0, message: "没有排班模板" };
    }

    // 2. 计算需要生成的日期范围
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + 1); // 从明天开始
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + daysAhead);

    // 3. 获取已存在的实例日期（避免重复生成）
    const { data: existingInstances, error: existingErr } = await this.supabase
      .from("slot_instances")
      .select("slot_date")
      .eq("tenant_id", tenantId)
      .gte("slot_date", startDate.toISOString().split("T")[0])
      .lte("slot_date", endDate.toISOString().split("T")[0]);

    if (existingErr) throw new Error(existingErr.message);

    const existingDates = new Set(
      (existingInstances || []).map((s: any) => s.slot_date)
    );

    // 4. 为每一天生成时段
    let generated = 0;
    let skipped = 0;
    const instancesToInsert: any[] = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ...

      // 如果该日期已有实例，跳过
      if (existingDates.has(dateStr)) {
        skipped++;
        continue;
      }

      // 找到匹配的模板（day_of_week 匹配）
      const matchedTemplates = templates.filter((t: any) => t.day_of_week === dayOfWeek);

      for (const template of matchedTemplates) {
        instancesToInsert.push({
          tenant_id: tenantId,
          location_id: template.location_id,
          doctor_id: template.doctor_id,
          service_id: template.service_id,
          slot_date: dateStr,
          start_time: template.start_time,
          end_time: template.end_time,
          max_capacity: template.max_capacity || 1,
          booked_count: 0,
          status: "open",
          version: 1,
        });
      }
    }

    // 5. 批量插入
    if (instancesToInsert.length > 0) {
      const { error: insertErr } = await this.supabase
        .from("slot_instances")
        .insert(instancesToInsert);

      if (insertErr) throw new Error(insertErr.message);
      generated = instancesToInsert.length;
    }

    return { generated, skipped, total: instancesToInsert.length + skipped };
  }
}
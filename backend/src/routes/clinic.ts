import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export async function clinicRoutes(fastify: FastifyInstance) {
  // ========== 診所登入 ==========
  fastify.post("/api/auth/clinic/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = req.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ error: "Email 和密碼為必填" });
    }

    // 查詢使用者
    const { data: user, error } = await fastify.supabase
      .from("users")
      .select("id, email, password_hash, role, tenant_id")
      .eq("email", email)
      .eq("role", "clinic_admin")
      .single();

    if (error || !user) {
      return reply.status(401).send({ error: "帳號或密碼錯誤" });
    }

    // 驗證密碼（bcrypt 比對）
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return reply.status(401).send({ error: "帳號或密碼錯誤" });
    }

    // 產生 JWT
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    return reply.send({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenant_id: user.tenant_id,
        },
      },
    });
  });

  // ========== 取得診所所有預約（供後台使用） ==========
  fastify.get("/api/clinic/appointments", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) {
        return reply.status(400).send({ error: "缺少 tenant-id" });
      }

      const { status, date_from, date_to } = req.query as {
        status?: string;
        date_from?: string;
        date_to?: string;
      };

      let query = fastify.supabase
        .from("booking_events")
        .select(`
          id,
          status,
          source,
          created_at,
          patient_id,
          patients ( name_given, name_family, telecom_phone, telecom_email ),
          slot_instances!inner (
            slot_date,
            start_time,
            end_time,
            doctors ( name ),
            services ( name )
          )
        `)
        .eq("tenant_id", tenantId);

      if (status) query = query.eq("status", status);
      if (date_from) query = query.gte("slot_instances.slot_date", date_from);
      if (date_to) query = query.lte("slot_instances.slot_date", date_to);

      const { data, error } = await query.order("slot_instances(slot_date)", { ascending: true });

      if (error) throw new Error(error.message);

      const formatted = (data || []).map((apt: any) => ({
        id: apt.id,
        status: apt.status,
        source: apt.source,
        created_at: apt.created_at,
        patient_name: `${apt.patients?.name_family || ""}${apt.patients?.name_given || ""}`,
        patient_phone: apt.patients?.telecom_phone || "",
        patient_email: apt.patients?.telecom_email || "",
        slot_date: apt.slot_instances?.slot_date,
        start_time: apt.slot_instances?.start_time,
        end_time: apt.slot_instances?.end_time,
        doctor_name: apt.slot_instances?.doctors?.name || "未知醫師",
        service_name: apt.slot_instances?.services?.name || "未知服務",
      }));

      return reply.send({ data: formatted });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // ========== 更新預約狀態（標記完成 / 未到） ==========
  fastify.patch("/api/clinic/appointments/:id/status", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      const { status } = req.body as { status: string };
      const tenantId = req.headers["x-tenant-id"] as string;

      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });
      if (!["completed", "noshow", "cancelled", "arrived"].includes(status)) {
        return reply.status(400).send({ error: "無效的狀態值" });
      }

      const { error } = await fastify.supabase
        .from("booking_events")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId);

      if (error) throw new Error(error.message);

      return reply.send({ success: true, message: `預約狀態已更新為 ${status}` });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // ========== 時段模板 CRUD ==========
  // GET - 查詢時段模板
  fastify.get("/api/clinic/slots", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const { data, error } = await fastify.supabase
        .from("booking_slots")
        .select(`
          *,
          doctors ( id, name ),
          services ( id, name )
        `)
        .eq("tenant_id", tenantId);

      if (error) throw new Error(error.message);
      return reply.send({ data });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST - 建立時段模板
  fastify.post("/api/clinic/slots", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const { location_id, doctor_id, service_id, day_of_week, start_time, end_time, max_capacity } = req.body as any;

      const { data, error } = await fastify.supabase
        .from("booking_slots")
        .insert({
          tenant_id: tenantId,
          location_id,
          doctor_id,
          service_id,
          day_of_week,
          start_time,
          end_time,
          max_capacity: max_capacity || 1,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return reply.status(201).send({ data });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // PUT - 更新時段模板
  fastify.put("/api/clinic/slots/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const { location_id, doctor_id, service_id, day_of_week, start_time, end_time, max_capacity } = req.body as any;

      const { data, error } = await fastify.supabase
        .from("booking_slots")
        .update({
          location_id,
          doctor_id,
          service_id,
          day_of_week,
          start_time,
          end_time,
          max_capacity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return reply.send({ data });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // DELETE - 刪除時段模板
  fastify.delete("/api/clinic/slots/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const { error } = await fastify.supabase
        .from("booking_slots")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

      if (error) throw new Error(error.message);
      return reply.send({ success: true });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });


  // ========== 服務管理 ==========

  // GET - 查詢所有服務
  fastify.get("/api/clinic/services", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const { data, error } = await fastify.supabase
        .from("services")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return reply.send({ data });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // POST - 建立服務
  fastify.post("/api/clinic/services", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const {
        name,
        duration_minutes,
        is_active,
        is_recurring,
        recurrence_interval_days,
        strict_cooldown_days,
        reminder_lead_days,
        requires_deposit,
        deposit_amount,
      } = req.body as any;

      const { data, error } = await fastify.supabase
        .from("services")
        .insert({
          tenant_id: tenantId,
          name,
          duration_minutes: duration_minutes || 30,
          is_active: is_active !== undefined ? is_active : true,
          is_recurring: is_recurring || false,
          recurrence_interval_days: recurrence_interval_days || null,
          strict_cooldown_days: strict_cooldown_days || 0,
          reminder_lead_days: reminder_lead_days || 1,
          requires_deposit: requires_deposit || false,
          deposit_amount: deposit_amount || null,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return reply.status(201).send({ data });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // PUT - 更新服務
  fastify.put("/api/clinic/services/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const {
        name,
        duration_minutes,
        is_active,
        is_recurring,
        recurrence_interval_days,
        strict_cooldown_days,
        reminder_lead_days,
        requires_deposit,
        deposit_amount,
      } = req.body as any;

      const { data, error } = await fastify.supabase
        .from("services")
        .update({
          name,
          duration_minutes: duration_minutes || 30,
          is_active,
          is_recurring: is_recurring || false,
          recurrence_interval_days: recurrence_interval_days || null,
          strict_cooldown_days: strict_cooldown_days || 0,
          reminder_lead_days: reminder_lead_days || 1,
          requires_deposit: requires_deposit || false,
          deposit_amount: deposit_amount || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return reply.send({ data });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // DELETE - 刪除服務（軟刪除）
  fastify.delete("/api/clinic/services/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      // ✅ 正確取得 count
      const { count, error: countErr } = await fastify.supabase
        .from("booking_events")
        .select("id", { count: "exact", head: true })
        .eq("service_id", id)
        .eq("tenant_id", tenantId)
        .in("status", ["booked", "arrived", "completed"]);

      if (countErr) throw new Error(countErr.message);

      if (count && count > 0) {
        // ✅ 有預約記錄 → 只停用，不刪除（加上 tenant_id 過濾）
        const { error: updateError } = await fastify.supabase
          .from("services")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("tenant_id", tenantId);

        if (updateError) throw new Error(updateError.message);
        return reply.send({
          success: true,
          message: `服務已停用（有 ${count} 筆預約記錄，無法刪除）`,
          is_soft_deleted: true,
        });
      } else {
        // ✅ 無預約記錄 → 可刪除
        const { error: deleteError } = await fastify.supabase
          .from("services")
          .delete()
          .eq("id", id)
          .eq("tenant_id", tenantId);

        if (deleteError) throw new Error(deleteError.message);
        return reply.send({ success: true, message: "服務已刪除" });
      }
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

    // ========== 病人列表 ==========
  fastify.get("/api/clinic/patients", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const { search, limit = 50, offset = 0 } = req.query as {
        search?: string;
        limit?: string;
        offset?: string;
      };

      let query = fastify.supabase
        .from("patients")
        .select(`
          id,
          name_given,
          name_family,
          telecom_phone,
          telecom_email,
          gender,
          birth_date,
          created_at,
          email_verified
        `, { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      if (search) {
        query = query.or(`name_given.ilike.%${search}%,name_family.ilike.%${search}%,telecom_phone.ilike.%${search}%,telecom_email.ilike.%${search}%`);
      }

      const { data, error, count } = await query;

      if (error) throw new Error(error.message);

      // 取得每個病人的預約次數
      const patientIds = (data || []).map((p: any) => p.id);
      let appointmentCounts: Record<string, number> = {};
      if (patientIds.length > 0) {
        const { data: counts, error: cErr } = await fastify.supabase
          .from("booking_events")
          .select("patient_id", { count: "exact" })
          .in("patient_id", patientIds);
        if (!cErr) {
          const countMap = new Map<string, number>();
          counts?.forEach((c: any) => {
            countMap.set(c.patient_id, (countMap.get(c.patient_id) || 0) + 1);
          });
          appointmentCounts = Object.fromEntries(countMap);
        }
      }

      const formatted = (data || []).map((p: any) => ({
        ...p,
        appointment_count: appointmentCounts[p.id] || 0,
        name: `${p.name_family || ""}${p.name_given || ""}`,
      }));

      return reply.send({
        data: formatted,
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // ========== 取得某天的時段實例 ==========
  fastify.get("/api/clinic/slots/date", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const { date } = req.query as { date: string };
      if (!date) return reply.status(400).send({ error: "缺少日期參數" });

      const { data, error } = await fastify.supabase
        .from("slot_instances")
        .select(`
          id,
          slot_date,
          start_time,
          end_time,
          max_capacity,
          booked_count,
          status,
          doctors ( id, name ),
          services ( id, name )
        `)
        .eq("tenant_id", tenantId)
        .eq("slot_date", date)
        .eq("status", "open")
        .order("start_time", { ascending: true });

      if (error) throw new Error(error.message);
      return reply.send({ data });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // ========== 建立某天的時段實例 ==========
  fastify.post("/api/clinic/slots/date", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const { slot_date, start_time, end_time, max_capacity, doctor_id, service_id } = req.body as any;

      if (!slot_date || !start_time || !end_time || !doctor_id || !service_id) {
        return reply.status(400).send({ error: "缺少必要參數" });
      }

      // 檢查該時段是否已被佔用（同一醫師同一時間）
      const { data: existing, error: checkErr } = await fastify.supabase
        .from("slot_instances")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("slot_date", slot_date)
        .eq("doctor_id", doctor_id)
        .eq("start_time", start_time)
        .eq("status", "open")
        .maybeSingle();

      if (checkErr) throw new Error(checkErr.message);
      if (existing) {
        return reply.status(409).send({ error: "該醫師在此時間已有時段" });
      }

      const { data, error } = await fastify.supabase
        .from("slot_instances")
        .insert({
          tenant_id: tenantId,
          slot_date,
          start_time,
          end_time,
          max_capacity: max_capacity || 1,
          booked_count: 0,
          status: "open",
          version: 1,
        })
        .select(`
          id,
          slot_date,
          start_time,
          end_time,
          max_capacity,
          booked_count,
          status,
          doctors ( id, name ),
          services ( id, name )
        `)
        .single();

      if (error) throw new Error(error.message);
      return reply.status(201).send({ data });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // ========== 刪除某天的時段實例 ==========
  fastify.delete("/api/clinic/slots/date/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string };
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      // 檢查是否有預約使用此時段
      const { count, error: countErr } = await fastify.supabase
        .from("booking_events")
        .select("id", { count: "exact", head: true })
        .eq("slot_instance_id", id)
        .eq("tenant_id", tenantId)
        .in("status", ["booked", "arrived", "completed"]);

      if (countErr) throw new Error(countErr.message);

      if (count && count > 0) {
        // 有預約 → 只關閉，不刪除
        const { error: updateError } = await fastify.supabase
          .from("slot_instances")
          .update({ status: "closed", updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("tenant_id", tenantId);

        if (updateError) throw new Error(updateError.message);
        return reply.send({
          success: true,
          message: `時段已關閉（有 ${count} 筆預約，無法刪除）`,
        });
      } else {
        // 無預約 → 可刪除
        const { error: deleteError } = await fastify.supabase
          .from("slot_instances")
          .delete()
          .eq("id", id)
          .eq("tenant_id", tenantId);

        if (deleteError) throw new Error(deleteError.message);
        return reply.send({ success: true, message: "時段已刪除" });
      }
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });

  // ========== 取得該診所的所有醫師 ==========
  fastify.get("/api/clinic/doctors", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = req.headers["x-tenant-id"] as string;
      if (!tenantId) return reply.status(400).send({ error: "缺少 tenant-id" });

      const { data, error } = await fastify.supabase
        .from("doctors")
        .select("id, name, specialty")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);
      return reply.send({ data });
    } catch (error: any) {
      req.log.error(error);
      return reply.status(500).send({ error: error.message });
    }
  });
}
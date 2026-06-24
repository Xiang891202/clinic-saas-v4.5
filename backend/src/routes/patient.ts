// backend/src/routes/patient.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";

// 從 JWT 中取得 patientId 的輔助函數
function getPatientIdFromRequest(req: FastifyRequest): string {
  const authHeader = req.headers.authorization;
  if (!authHeader) throw new Error("未授權");
  
  const token = authHeader.replace("Bearer ", "");
  const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
  return decoded.patientId;
}

export async function patientRoutes(fastify: FastifyInstance) {
  // ========== 取得病人個人資訊 ==========
  fastify.get("/api/patient/profile", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const patientId = getPatientIdFromRequest(req);
      
      const { data, error } = await fastify.supabase
        .from("patients")
        .select("id, name_given, name_family, telecom_phone, telecom_email, gender, birth_date")
        .eq("id", patientId)
        .single();

      if (error) throw new Error(error.message);
      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.status(401).send({ error: error.message });
    }
  });

  // ========== 更新病人個人資訊 ==========
  fastify.put("/api/patient/profile", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const patientId = getPatientIdFromRequest(req);
      const { name_given, name_family, telecom_phone, gender, birth_date } = req.body as any;

      const { data, error } = await fastify.supabase
        .from("patients")
        .update({
          name_given,
          name_family,
          telecom_phone,
          gender,
          birth_date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", patientId)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return reply.send({ success: true, data });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // ========== 取得病人設定 ==========
    fastify.get("/api/patient/settings", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
        const patientId = getPatientIdFromRequest(req);

        const { data, error } = await fastify.supabase
        .from("patients")
        .select("id, ical_uuid, line_user_id, telecom_email, google_calendar_synced")
        .eq("id", patientId)
        .single();

        if (error) throw new Error(error.message);
        return reply.send({
        success: true,
        data: {
            ical_url: `${process.env.BASE_URL || "http://localhost:3000"}/api/patient/calendar/ical/${data.ical_uuid}`,
            line_user_id: data.line_user_id,
            telecom_email: data.telecom_email,
            google_calendar_synced: data.google_calendar_synced || false,
        },
        });
    } catch (error: any) {
        return reply.status(401).send({ error: error.message });
    }
    });
}
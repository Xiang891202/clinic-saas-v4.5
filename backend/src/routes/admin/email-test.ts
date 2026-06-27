// backend/src/routes/admin/email-test.ts
import { FastifyInstance } from "fastify";
import { safeHandler } from "../../utils/controller-wrapper";
import { success, error } from "../../utils/response";
import nodemailer from "nodemailer";

export async function adminEmailTestRoutes(fastify: FastifyInstance) {
  
  // ========== 发送测试邮件 ==========
  fastify.post(
    "/api/admin/email/test",
    {
      schema: {
        body: {
          type: "object",
          required: ["to"],
          properties: {
            to: { type: "string", format: "email" },
            subject: { type: "string" },
            content: { type: "string" },
          },
        },
      },
    },
    safeHandler(async (req, reply) => {
      const { to, subject = "[测试] 邮件服务测试", content } = req.body as {
        to: string;
        subject?: string;
        content?: string;
      };

      // 获取 SMTP 配置
      const smtpConfig = {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      };

      if (!smtpConfig.host || !smtpConfig.auth.user) {
        return reply.status(400).send(error("SMTP 未配置，请检查环境变量"));
      }

      const transporter = nodemailer.createTransport(smtpConfig);

      const testContent = content || `
您好，

这是一封测试邮件，用于确认诊所预约系统的邮件服务配置是否正确。

发送时间: ${new Date().toISOString()}
SMTP 服务器: ${smtpConfig.host}

如果您收到此邮件，说明邮件服务配置正常。

---
诊所预约系统
`;

      const startTime = Date.now();

      try {
        const info = await transporter.sendMail({
          from: smtpConfig.auth.user,
          to,
          subject,
          text: testContent,
        });

        const elapsed = Date.now() - startTime;

        return reply.send(success({
          success: true,
          message: "测试邮件已发送",
          to,
          messageId: info.messageId,
          elapsed_ms: elapsed,
          smtp_config: {
            host: smtpConfig.host,
            port: smtpConfig.port,
            user: smtpConfig.auth.user,
          },
        }));
      } catch (err: any) {
        return reply.status(500).send(error(`邮件发送失败: ${err.message}`));
      }
    })
  );

  // ========== 获取 SMTP 配置状态 ==========
  fastify.get(
    "/api/admin/email/config",
    safeHandler(async (req, reply) => {
      const config = {
        configured: !!(process.env.SMTP_HOST && process.env.SMTP_USER),
        host: process.env.SMTP_HOST || "未配置",
        port: process.env.SMTP_PORT || "未配置",
        user: process.env.SMTP_USER ? process.env.SMTP_USER.replace(/(.{3}).*(@.*)/, "$1***$2") : "未配置",
        secure: process.env.SMTP_SECURE === "true",
      };

      return reply.send(success(config));
    })
  );
}
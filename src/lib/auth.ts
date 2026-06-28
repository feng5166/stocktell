import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/prisma";
import { sendFeishu, beijingTime } from "@/lib/feishu";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// 用户不存在时也跑一次比对,消除「跳过 bcrypt → 响应更快」的时间侧信道(防用户枚举)
const DUMMY_HASH = "$2b$12$pugWVqRMmTukiGoeFtAV1udTmBD.M8DfP8opT5ZxcAHm0WwzLuZRi";

const gid = process.env.GOOGLE_CLIENT_ID;
const gsecret = process.env.GOOGLE_CLIENT_SECRET;
export const isGoogleAuthEnabled = !!(gid && gsecret);

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    ...(isGoogleAuthEnabled
      ? [GoogleProvider({ clientId: gid!, clientSecret: gsecret! })]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const db = getPrisma();
        if (!db) throw new Error("数据库未连接");
        if (!credentials?.email || !credentials?.password) {
          throw new Error("请输入邮箱和密码");
        }
        const email = credentials.email.toLowerCase().trim();

        // 限流:同一 IP+邮箱 5 分钟最多 10 次登录尝试,挡暴力撞密码
        const ip = clientIp(req?.headers);
        const limited = !rateLimit(`login:${ip}:${email}`, 10, 5 * 60 * 1000).ok;
        if (limited) throw new Error("登录尝试过于频繁,请 5 分钟后再试");

        const user = await db.user.findUnique({
          where: { email },
          // 显式 select:避免查到新增列(如 weixin_pending_scan_at),否则生产库该列还没建时登录全挂
          select: { id: true, email: true, passwordHash: true, nickname: true, avatar: true },
        });
        // 用户不存在也跑一次假比对,抹平时间差(防枚举);随后按「密码错误」统一处理
        if (!user || !user.passwordHash) {
          await bcrypt.compare(credentials.password, DUMMY_HASH);
          throw new Error("密码错误,请重新输入");
        }
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) throw new Error("密码错误,请重新输入");
        return {
          id: user.id,
          email: user.email,
          name: user.nickname,
          image: user.avatar,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Google 首次登录自动建用户(JWT 模式,无需 Account 表)
      if (account?.provider === "google") {
        const db = getPrisma();
        if (!db || !user.email) return false;
        const existing = await db.user.findUnique({
          where: { email: user.email },
          select: { id: true }, // 仅判存在,避免 select 到生产库尚未建的新列
        });
        if (!existing) {
          const created = await db.user.create({
            data: {
              email: user.email,
              nickname: user.name ?? user.email.split("@")[0],
              avatar: user.image,
            },
            select: { id: true, email: true },
          });
          user.id = created.id;
          // 飞书提醒:新用户(Google)
          await sendFeishu(
            [
              "✅ StockTell 新用户注册",
              `邮箱:${created.email}`,
              "方式:Google",
              `时间:${beijingTime()}`,
              `ID:${created.id}`,
            ].join("\n")
          );
        } else {
          user.id = existing.id;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
};

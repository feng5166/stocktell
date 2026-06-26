import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/prisma";
import { sendFeishu, beijingTime } from "@/lib/feishu";

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
      async authorize(credentials) {
        const db = getPrisma();
        if (!db) throw new Error("数据库未连接");
        if (!credentials?.email || !credentials?.password) {
          throw new Error("请输入邮箱和密码");
        }
        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user || !user.passwordHash) return null;
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
        const existing = await db.user.findUnique({ where: { email: user.email } });
        if (!existing) {
          const created = await db.user.create({
            data: {
              email: user.email,
              nickname: user.name ?? user.email.split("@")[0],
              avatar: user.image,
            },
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

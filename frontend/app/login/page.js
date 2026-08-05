import LoginClient from "./LoginClient";

export const metadata = {
  title: "Login - JanPukar",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-start justify-center py-12 px-4 bg-gray-50">
      <LoginClient />
    </main>
  );
}

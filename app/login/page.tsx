"use client";

import { type FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function signIn(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setMessage("");

    if (!email.trim() || !password) {
      setMessage("Email and password are required.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;

    if (!userId) {
      setMessage("Login succeeded, but no user profile was found.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      setMessage("Login succeeded, but profile setup is missing.");
      setLoading(false);
      return;
    }

    if (profile.role === "customer") {
      window.location.href = "/customer";
      return;
    }

    if (profile.role === "operator") {
      window.location.href = "/hardband";
      return;
    }

    window.location.href = "/";
  }

  async function sendPasswordReset() {
    setMessage("");

    if (!email.trim()) {
      setMessage("Enter your email address first, then use Forgot Password.");
      return;
    }

    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    });

    setResetLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Password reset email sent. Check your inbox.");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand compact">
          <div className="brand-mark">PF</div>
          <div>
            <div className="brand-title">TITAN</div>
            <div className="brand-subtitle">Tubular Inventory Tracking & Asset Navigation</div>
          </div>
        </div>

        <form onSubmit={signIn} autoComplete="off">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              autoComplete="off"
              autoFocus
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              autoComplete="current-password"
            />
          </label>

          {message && <div className="modal-message">{message}</div>}

          <button className="button primary" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <button
            className="forgot-password-link"
            type="button"
            onClick={sendPasswordReset}
            disabled={resetLoading}
          >
            {resetLoading ? "Sending reset..." : "Forgot password?"}
          </button>
        </form>
      </section>
    </main>
  );
}



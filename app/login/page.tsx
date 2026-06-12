"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("wade@pathfinderinspections.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setMessage("");
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
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

    window.location.href = "/";
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand compact">
          <div className="brand-mark">PF</div>
          <div>
            <div className="brand-title">PIFS Tubular Management</div>
            <div className="brand-subtitle">Secure yard inventory login</div>
          </div>
        </div>

        <label>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
          />
        </label>

        {message && <div className="modal-message">{message}</div>}

        <button className="button primary" onClick={signIn} disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </section>
    </main>
  );
}
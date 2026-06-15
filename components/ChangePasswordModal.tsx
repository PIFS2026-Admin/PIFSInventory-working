"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";

type ChangePasswordModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function savePassword() {
    setMessage("");

    if (newPassword.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setMessage("Password updated successfully.");
  }

  function closeModal() {
    setNewPassword("");
    setConfirmPassword("");
    setMessage("");
    onClose();
  }

  return (
    <div className="modal-backdrop">
      <section className="slide-over password-modal">
        <div className="slide-header">
          <div>
            <h2>Change Password</h2>
            <p>Update the password for your current login.</p>
          </div>
          <button className="icon-button" onClick={closeModal}>X</button>
        </div>

        {message && <div className="modal-message">{message}</div>}

        <div className="form-grid">
          <label className="full">
            New Password
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </label>

          <label className="full">
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              onKeyDown={(event) => {
                if (event.key === "Enter") savePassword();
              }}
            />
          </label>
        </div>

        <div className="slide-actions">
          <button className="button" onClick={closeModal}>Cancel</button>
          <button className="button primary" onClick={savePassword} disabled={saving}>
            {saving ? "Saving..." : "Save Password"}
          </button>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type TitanNotification = {
  id: string;
  title: string;
  body: string | null;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  action_label: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

function formatNotificationDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [notifications, setNotifications] = useState<TitanNotification[]>([]);

  const unreadCount = useMemo(() => {
    return notifications.filter((item) => !item.read_at).length;
  }, [notifications]);

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 60000);
    return () => window.clearInterval(interval);
  }, []);

  async function loadNotifications() {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, body, category, priority, action_label, action_url, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setNotifications((data ?? []) as TitanNotification[]);
    setLoading(false);
  }

  async function markRead(id: string) {
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item
      )
    );
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((item) => !item.read_at).map((item) => item.id);
    if (unreadIds.length === 0) return;

    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .in("id", unreadIds);

    if (error) {
      setMessage(error.message);
      return;
    }

    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })));
  }

  async function openNotification(item: TitanNotification) {
    if (!item.read_at) {
      await markRead(item.id);
    }

    if (item.action_url) {
      window.location.href = item.action_url;
    }
  }

  return (
    <div className="notification-center">
      <button
        className="button notification-button"
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) loadNotifications();
        }}
      >
        Alerts
        {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
      </button>

      {open && (
        <section className="notification-panel">
          <div className="notification-panel-header">
            <div>
              <h3>Notifications</h3>
              <p>{unreadCount} unread</p>
            </div>
            <div className="notification-panel-actions">
              <button className="button tiny" type="button" onClick={loadNotifications} disabled={loading}>
                Refresh
              </button>
              <button className="button tiny" type="button" onClick={markAllRead} disabled={unreadCount === 0}>
                Mark Read
              </button>
            </div>
          </div>

          {message && <div className="modal-message compact">{message}</div>}

          <div className="notification-list">
            {notifications.length === 0 && (
              <div className="notification-empty">{loading ? "Loading alerts..." : "No notifications yet."}</div>
            )}

            {notifications.map((item) => (
              <button
                key={item.id}
                className={`notification-item ${item.read_at ? "read" : "unread"} ${item.priority}`}
                type="button"
                onClick={() => openNotification(item)}
              >
                <div className="notification-item-top">
                  <strong>{item.title}</strong>
                  <span>{formatNotificationDate(item.created_at)}</span>
                </div>
                {item.body && <p>{item.body}</p>}
                <div className="notification-item-bottom">
                  <span>{item.category}</span>
                  {item.action_label && <em>{item.action_label}</em>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { getTitanPushState, subscribeToTitanPush, type TitanPushState } from "../lib/clientPush";
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
  const [pushMessage, setPushMessage] = useState("");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushState, setPushState] = useState<TitanPushState | null>(null);
  const [notifications, setNotifications] = useState<TitanNotification[]>([]);

  const unreadCount = useMemo(() => {
    return notifications.filter((item) => !item.read_at).length;
  }, [notifications]);

  useEffect(() => {
    loadNotifications();
    refreshPushState();
    const interval = window.setInterval(loadNotifications, 60000);

    const channel = supabase
      .channel(`titan-notifications-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        loadNotifications();
      })
      .subscribe();

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  async function refreshPushState() {
    const state = await getTitanPushState().catch(() => null);
    setPushState(state);
  }

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

  async function enablePushNotifications() {
    setPushBusy(true);
    setPushMessage("");

    try {
      await subscribeToTitanPush();
      setPushMessage("Push notifications are on for this device.");
      await refreshPushState();
    } catch (error: unknown) {
      setPushMessage(error instanceof Error ? error.message : "Push notifications could not be enabled.");
    } finally {
      setPushBusy(false);
    }
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
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        title="Notifications"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) loadNotifications();
        }}
      >
        <svg className="notification-bell-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span className="notification-label">Notifications</span>
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
              {pushState?.supported && pushState.configured && (
                <button
                  className="button tiny"
                  type="button"
                  onClick={enablePushNotifications}
                  disabled={pushBusy || pushState.subscribed || pushState.permission === "denied"}
                >
                  {pushState.subscribed ? "Push On" : "Enable Push"}
                </button>
              )}
              <button className="button tiny" type="button" onClick={markAllRead} disabled={unreadCount === 0}>
                Mark Read
              </button>
            </div>
          </div>

          {message && <div className="modal-message compact">{message}</div>}
          {pushMessage && <div className="modal-message compact">{pushMessage}</div>}

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

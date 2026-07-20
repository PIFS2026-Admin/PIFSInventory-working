"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import {
  ServiceLineBoardConfig,
  isServiceLineBoardKey,
  serviceLineBoardTagColors,
  serviceLineBoardConfigs,
  serviceLineBoardKeys,
} from "../../../../lib/serviceLineBoards";
import styles from "./service-line-board.module.css";

type PageProps = {
  params: {
    boardKey: string;
  };
};

type BoardRow = {
  id: string;
  board_key: string;
  service_line_key: string;
  name: string;
  description: string | null;
};

type ColumnRow = {
  id: string;
  board_id: string;
  column_key: string;
  title: string;
  description: string | null;
  color: string | null;
  sort_order: number | null;
};

type CardRow = {
  id: string;
  board_id: string;
  column_id: string;
  card_number: string | null;
  title: string;
  description: string | null;
  priority: string | null;
  customer_name: string | null;
  location_name: string | null;
  assigned_to_profile_id: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  sort_order: number | null;
  tags: string[] | null;
  source_type: string | null;
  source_id: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type CommentRow = {
  id: string;
  card_id: string;
  body: string;
  created_by_name: string | null;
  created_at: string | null;
};

type ChecklistRow = {
  id: string;
  card_id: string;
  label: string;
  is_done: boolean | null;
  sort_order: number | null;
};

type ActivityRow = {
  id: string;
  card_id: string | null;
  action: string;
  user_name: string | null;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  created_at: string | null;
};

type BoardColumn = {
  id: string;
  boardId: string;
  key: string;
  title: string;
  description: string;
  color: string;
  sortOrder: number;
};

type BoardCard = {
  id: string;
  boardId: string;
  columnId: string;
  cardNumber: string;
  title: string;
  description: string;
  priority: "Low" | "Normal" | "High" | "Critical";
  customerName: string;
  locationName: string;
  assignedToProfileId: string;
  assignedToName: string;
  dueDate: string;
  sortOrder: number;
  tags: string[];
  sourceType: string;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
};

type ProfileOption = {
  id: string;
  fullName: string;
  role: string;
};

type CardForm = {
  columnId: string;
  title: string;
  description: string;
  priority: BoardCard["priority"];
  customerName: string;
  locationName: string;
  assignedToProfileId: string;
  dueDate: string;
  tagsText: string;
};

const emptyCardForm: CardForm = {
  columnId: "",
  title: "",
  description: "",
  priority: "Normal",
  customerName: "",
  locationName: "",
  assignedToProfileId: "",
  dueDate: "",
  tagsText: "",
};

type ColumnForm = {
  title: string;
  description: string;
  color: string;
};

const emptyColumnForm: ColumnForm = {
  title: "",
  description: "",
  color: "#fb923c",
};

const priorityOptions: BoardCard["priority"][] = ["Low", "Normal", "High", "Critical"];

function navigate(href: string) {
  window.location.href = href;
}

function isMissingSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return error.code === "42P01" || error.code === "42703" || message.includes("does not exist") || message.includes("schema cache");
}

function formatDate(value: string) {
  if (!value) return "No date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16);
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function splitTags(value: string) {
  return value
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function slugifyColumnKey(value: string, existingKeys: Set<string>) {
  const base =
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 42) || "lane";
  let key = base;
  let index = 2;

  while (existingKeys.has(key)) {
    key = `${base}_${index}`;
    index += 1;
  }

  return key;
}

function tagColor(tag: string) {
  return serviceLineBoardTagColors[tag] ?? "#64748b";
}

const employeeRoleTags = new Set(Object.keys(serviceLineBoardTagColors).filter((tag) => tag !== "Safety Hours"));

function isEmployeeCard(card: BoardCard) {
  return card.tags.some((tag) => employeeRoleTags.has(tag));
}

function isBullpenColumn(column: BoardColumn) {
  const title = column.title.trim().toLowerCase();
  return title === "bullpen" || column.key.includes("bullpen");
}

function mapColumn(row: ColumnRow): BoardColumn {
  return {
    id: row.id,
    boardId: row.board_id,
    key: row.column_key,
    title: row.title,
    description: row.description ?? "",
    color: row.color ?? "#fb923c",
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapCard(row: CardRow): BoardCard {
  const priority = priorityOptions.includes(row.priority as BoardCard["priority"])
    ? (row.priority as BoardCard["priority"])
    : "Normal";

  return {
    id: row.id,
    boardId: row.board_id,
    columnId: row.column_id,
    cardNumber: row.card_number || "CARD",
    title: row.title,
    description: row.description ?? "",
    priority,
    customerName: row.customer_name ?? "",
    locationName: row.location_name ?? "",
    assignedToProfileId: row.assigned_to_profile_id ?? "",
    assignedToName: row.assigned_to_name ?? "",
    dueDate: row.due_date ?? "",
    sortOrder: Number(row.sort_order ?? 0),
    tags: Array.isArray(row.tags) ? row.tags : [],
    sourceType: row.source_type ?? "",
    sourceId: row.source_id ?? "",
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

function createFallbackColumns(config: ServiceLineBoardConfig): BoardColumn[] {
  return config.columns.map((column, index) => ({
    id: `local-column-${column.key}`,
    boardId: "local-board",
    key: column.key,
    title: column.title,
    description: column.description,
    color: column.color,
    sortOrder: (index + 1) * 100,
  }));
}

function createFallbackCards(config: ServiceLineBoardConfig, columns: BoardColumn[]): BoardCard[] {
  return config.starterCards.map((card, index) => {
    const column = columns.find((item) => item.key === card.columnKey) ?? columns[0];

    return {
      id: `local-card-${config.key}-${index + 1}`,
      boardId: "local-board",
      columnId: column?.id ?? "local-column",
      cardNumber: `${config.key.toUpperCase()}-${index + 1}`,
      title: card.title,
      description: card.description,
      priority: card.priority,
      customerName: card.customerName ?? "",
      locationName: card.locationName ?? "",
      assignedToProfileId: "",
      assignedToName: "",
      dueDate: "",
      sortOrder: (index + 1) * 100,
      tags: card.tags,
      sourceType: "starter",
      sourceId: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
}

function cardFormFromCard(card: BoardCard): CardForm {
  return {
    columnId: card.columnId,
    title: card.title,
    description: card.description,
    priority: card.priority,
    customerName: card.customerName,
    locationName: card.locationName,
    assignedToProfileId: card.assignedToProfileId,
    dueDate: card.dueDate,
    tagsText: card.tags.join(", "),
  };
}

function cardPatchFromForm(form: CardForm, profiles: ProfileOption[]) {
  const profile = profiles.find((item) => item.id === form.assignedToProfileId);

  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    priority: form.priority,
    customer_name: form.customerName.trim() || null,
    location_name: form.locationName.trim() || null,
    assigned_to_profile_id: form.assignedToProfileId || null,
    assigned_to_name: profile?.fullName || null,
    due_date: form.dueDate || null,
    tags: splitTags(form.tagsText),
  };
}

function DroppableColumn({
  column,
  cards,
  selectedCardId,
  onSelectCard,
  onAddCard,
  onEditColumn,
  onArchiveColumn,
  onSendToBullpen,
  bullpenColumnId,
}: {
  column: BoardColumn;
  cards: BoardCard[];
  selectedCardId: string;
  onSelectCard: (card: BoardCard) => void;
  onAddCard: (column: BoardColumn) => void;
  onEditColumn: (column: BoardColumn) => void;
  onArchiveColumn: (column: BoardColumn) => void;
  onSendToBullpen: (card: BoardCard) => void;
  bullpenColumnId: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `lane:${column.id}`,
    data: { type: "column", columnId: column.id },
  });
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `column:${column.id}`,
    data: { columnId: column.id },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform), transition } : { transition };

  return (
    <section
      ref={setNodeRef}
      className={`${styles.column} ${isOver ? styles.columnOver : ""} ${isDragging ? styles.columnDragging : ""}`}
      style={style}
    >
      <header className={styles.columnHead} style={{ borderTopColor: column.color }}>
        <div>
          <h2>{column.title}</h2>
          <p>{column.description}</p>
        </div>
        <div className={styles.columnTools}>
          <span>{cards.length}</span>
          <button type="button" {...listeners} {...attributes} aria-label={`Move ${column.title} list`}>
            Move
          </button>
          <button type="button" onClick={() => onEditColumn(column)} aria-label={`Edit ${column.title} list`}>
            Edit
          </button>
          <button type="button" onClick={() => onAddCard(column)} aria-label={`Add card to ${column.title}`}>
            +
          </button>
          <button type="button" onClick={() => onArchiveColumn(column)} aria-label={`Archive ${column.title} list`}>
            Archive
          </button>
        </div>
      </header>

      <div ref={setDropRef} className={styles.cardStack}>
        {cards.length === 0 ? (
          <div className={styles.emptyColumn}>Drop cards here</div>
        ) : (
          <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
            {cards.map((card) => (
              <SortableBoardCard
                key={card.id}
                card={card}
                selected={selectedCardId === card.id}
                onSelect={() => onSelectCard(card)}
                onSendToBullpen={() => onSendToBullpen(card)}
                canSendToBullpen={Boolean(bullpenColumnId) && card.columnId !== bullpenColumnId && isEmployeeCard(card)}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </section>
  );
}

function SortableBoardCard({
  card,
  selected,
  onSelect,
  onSendToBullpen,
  canSendToBullpen,
}: {
  card: BoardCard;
  selected: boolean;
  onSelect: () => void;
  onSendToBullpen: () => void;
  canSendToBullpen: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", cardId: card.id },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform), transition } : { transition };

  return (
    <article
      ref={setNodeRef}
      className={`${styles.card} ${selected ? styles.cardSelected : ""} ${isDragging ? styles.cardDragging : ""}`}
      style={style}
      {...listeners}
      {...attributes}
    >
      <button className={styles.cardOpen} type="button" onClick={onSelect}>
        <span className={styles.cardNumber}>{card.cardNumber}</span>
        <strong>{card.title}</strong>
        <small>{card.customerName || card.locationName || "No customer/location yet"}</small>
      </button>

      <div className={styles.cardMeta}>
        <span className={`${styles.priority} ${styles[`priority${card.priority}`]}`}>{card.priority}</span>
        {card.dueDate && <span>Due {formatDate(card.dueDate)}</span>}
      </div>

      {card.tags.length > 0 && (
        <div className={styles.tagRow}>
          {card.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              style={{
                borderColor: `${tagColor(tag)}88`,
                background: `color-mix(in srgb, ${tagColor(tag)} 18%, #080b0f)`,
                color: "#fff",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {canSendToBullpen && (
        <div className={styles.cardActions}>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSendToBullpen();
            }}
          >
            Send to Bullpen
          </button>
        </div>
      )}
    </article>
  );
}

export default function ServiceLineBoardPage({ params }: PageProps) {
  const boardKey = isServiceLineBoardKey(params.boardKey) ? params.boardKey : "dti";
  const config = serviceLineBoardConfigs[boardKey];
  const fallbackColumns = useMemo(() => createFallbackColumns(config), [config]);
  const fallbackCards = useMemo(() => createFallbackCards(config, fallbackColumns), [config, fallbackColumns]);
  const [board, setBoard] = useState<BoardRow | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>(fallbackColumns);
  const [cards, setCards] = useState<BoardCard[]>(fallbackCards);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedCardId, setSelectedCardId] = useState("");
  const [cardForm, setCardForm] = useState<CardForm>(emptyCardForm);
  const [newCardForm, setNewCardForm] = useState<CardForm>(emptyCardForm);
  const [showNewCard, setShowNewCard] = useState(false);
  const [showNewColumn, setShowNewColumn] = useState(false);
  const [newColumnForm, setNewColumnForm] = useState<ColumnForm>(emptyColumnForm);
  const [editingColumnId, setEditingColumnId] = useState("");
  const [editColumnForm, setEditColumnForm] = useState<ColumnForm>(emptyColumnForm);
  const [boardSearch, setBoardSearch] = useState("");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [message, setMessage] = useState("");
  const [activeDragCard, setActiveDragCard] = useState<BoardCard | null>(null);
  const [activeDragColumn, setActiveDragColumn] = useState<BoardColumn | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserName, setCurrentUserName] = useState("TITAN user");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  const visibleCards = useMemo(() => {
    const search = normalizeSearch(boardSearch);
    if (!search) return cards;

    return cards.filter((card) => {
      const column = columns.find((item) => item.id === card.columnId);
      const haystack = [
        card.cardNumber,
        card.title,
        card.customerName,
        card.locationName,
        card.assignedToName,
        card.priority,
        column?.title ?? "",
        ...card.tags,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [boardSearch, cards, columns]);

  const cardsByColumn = useMemo(() => {
    const groups = new Map<string, BoardCard[]>();
    columns.forEach((column) => groups.set(column.id, []));
    visibleCards.forEach((card) => {
      const list = groups.get(card.columnId) ?? [];
      list.push(card);
      groups.set(card.columnId, list);
    });
    groups.forEach((list) => list.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)));
    return groups;
  }, [columns, visibleCards]);

  const selectedCard = useMemo(() => cards.find((card) => card.id === selectedCardId) ?? null, [cards, selectedCardId]);
  const bullpenColumn = useMemo(() => columns.find(isBullpenColumn) ?? null, [columns]);
  const boardStats = useMemo(() => {
    const active = cards.length;
    const urgent = cards.filter((card) => card.priority === "Critical" || card.priority === "High").length;
    const assigned = cards.filter((card) => card.assignedToName).length;
    const completeColumnKeys = new Set(["complete", "closed", "invoiced"]);
    const done = cards.filter((card) => {
      const column = columns.find((item) => item.id === card.columnId);
      return column ? completeColumnKeys.has(column.key) : false;
    }).length;

    return { active, urgent, assigned, done, lists: columns.length, visible: visibleCards.length };
  }, [cards, columns, visibleCards]);

  const loadProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .neq("role", "customer")
      .order("full_name", { ascending: true });

    if (error) return;

    setProfiles(
      (data ?? []).map((profile: ProfileRow) => ({
        id: profile.id,
        fullName: profile.full_name || "Unnamed user",
        role: profile.role || "employee",
      }))
    );
  }, []);

  const applyFallbackMode = useCallback(
    (nextMessage: string) => {
      setSchemaReady(false);
      setBoard(null);
      setColumns(fallbackColumns);
      setCards(fallbackCards);
      setMessage(nextMessage);
    },
    [fallbackCards, fallbackColumns]
  );

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    setCurrentUserId(user?.id ?? "");

    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const fullName = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name : user.email ?? "TITAN user";
      setCurrentUserName(fullName);
    }

    const { data: boardData, error: boardError } = await supabase
      .from("service_boards")
      .select("id, board_key, service_line_key, name, description")
      .eq("board_key", boardKey)
      .maybeSingle();

    if (boardError) {
      setLoading(false);
      if (isMissingSchema(boardError)) {
        applyFallbackMode("Service line boards are staged in code. Run supabase/titan_service_line_boards.sql in a test database to persist cards and realtime movement.");
      } else {
        applyFallbackMode(boardError.message);
      }
      return;
    }

    if (!boardData) {
      setLoading(false);
      applyFallbackMode(`No board seed was found for ${config.title}. Run supabase/titan_service_line_boards.sql in the test database.`);
      return;
    }

    const typedBoard = boardData as BoardRow;
    setBoard(typedBoard);
    setSchemaReady(true);

    const [columnResult, cardResult] = await Promise.all([
      supabase
        .from("service_board_columns")
        .select("id, board_id, column_key, title, description, color, sort_order")
        .eq("board_id", typedBoard.id)
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("service_board_cards")
        .select(
          "id, board_id, column_id, card_number, title, description, priority, customer_name, location_name, assigned_to_profile_id, assigned_to_name, due_date, sort_order, tags, source_type, source_id, archived_at, created_at, updated_at"
        )
        .eq("board_id", typedBoard.id)
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
    ]);

    if (columnResult.error || cardResult.error) {
      setLoading(false);
      applyFallbackMode(columnResult.error?.message || cardResult.error?.message || "The board tables could not be loaded.");
      return;
    }

    const nextColumns = ((columnResult.data ?? []) as ColumnRow[]).map(mapColumn);
    const effectiveColumns = nextColumns.length > 0 ? nextColumns : fallbackColumns;
    setColumns(effectiveColumns);
    const activeColumnIds = new Set(effectiveColumns.map((column) => column.id));
    setCards(((cardResult.data ?? []) as CardRow[]).map(mapCard).filter((card) => activeColumnIds.has(card.columnId)));
    setLoading(false);
  }, [applyFallbackMode, boardKey, config.title, fallbackColumns]);

  const loadCardDetails = useCallback(
    async (cardId: string) => {
      if (!schemaReady || !cardId) {
        setComments([]);
        setChecklist([]);
        setActivity([]);
        return;
      }

      const [commentResult, checklistResult, activityResult] = await Promise.all([
        supabase
          .from("service_board_card_comments")
          .select("id, card_id, body, created_by_name, created_at")
          .eq("card_id", cardId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("service_board_card_checklist")
          .select("id, card_id, label, is_done, sort_order")
          .eq("card_id", cardId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("service_board_activity")
          .select("id, card_id, action, user_name, before_value, after_value, created_at")
          .eq("card_id", cardId)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      if (!commentResult.error) setComments((commentResult.data ?? []) as CommentRow[]);
      if (!checklistResult.error) setChecklist((checklistResult.data ?? []) as ChecklistRow[]);
      if (!activityResult.error) setActivity((activityResult.data ?? []) as ActivityRow[]);
    },
    [schemaReady]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfiles();
      void loadBoard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadBoard, loadProfiles]);

  useEffect(() => {
    if (!board?.id || !schemaReady) return;

    const channel = supabase
      .channel(`service-line-board:${board.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_board_cards", filter: `board_id=eq.${board.id}` }, () => {
        void loadBoard();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "service_board_columns", filter: `board_id=eq.${board.id}` }, () => {
        void loadBoard();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "service_board_activity", filter: `board_id=eq.${board.id}` }, () => {
        if (selectedCardId) void loadCardDetails(selectedCardId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [board?.id, loadBoard, loadCardDetails, schemaReady, selectedCardId]);

  useEffect(() => {
    if (!selectedCard) return;

    const timer = window.setTimeout(() => {
      void loadCardDetails(selectedCard.id);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadCardDetails, selectedCard]);

  function openCard(card: BoardCard) {
    setSelectedCardId(card.id);
    setCardForm(cardFormFromCard(card));
  }

  async function logActivity(cardId: string | null, action: string, beforeValue: Record<string, unknown> | null, afterValue: Record<string, unknown> | null) {
    if (!schemaReady || !board) return;

    await supabase.from("service_board_activity").insert({
      board_id: board.id,
      card_id: cardId,
      action,
      user_id: currentUserId || null,
      user_name: currentUserName,
      before_value: beforeValue,
      after_value: afterValue,
    });
  }

  async function createCard() {
    const targetColumn = columns.find((column) => column.id === newCardForm.columnId) ?? columns[0];
    if (!targetColumn || !newCardForm.title.trim()) {
      setMessage("Add a card title first.");
      return;
    }

    const assignedProfile = profiles.find((profile) => profile.id === newCardForm.assignedToProfileId);
    const nextSort = Math.max(0, ...cards.filter((card) => card.columnId === targetColumn.id).map((card) => card.sortOrder)) + 100;
    const payload = {
      column_id: targetColumn.id,
      title: newCardForm.title.trim(),
      description: newCardForm.description.trim() || null,
      priority: newCardForm.priority,
      customer_name: newCardForm.customerName.trim() || null,
      location_name: newCardForm.locationName.trim() || null,
      assigned_to_profile_id: newCardForm.assignedToProfileId || null,
      assigned_to_name: assignedProfile?.fullName || null,
      due_date: newCardForm.dueDate || null,
      sort_order: nextSort,
      tags: splitTags(newCardForm.tagsText),
    };

    if (!schemaReady || !board) {
      const localCard: BoardCard = {
        id: `local-card-${Date.now()}`,
        boardId: "local-board",
        columnId: targetColumn.id,
        cardNumber: `LOCAL-${cards.length + 1}`,
        title: payload.title,
        description: payload.description ?? "",
        priority: payload.priority,
        customerName: payload.customer_name ?? "",
        locationName: payload.location_name ?? "",
        assignedToProfileId: payload.assigned_to_profile_id ?? "",
        assignedToName: payload.assigned_to_name ?? "",
        dueDate: payload.due_date ?? "",
        sortOrder: payload.sort_order,
        tags: payload.tags,
        sourceType: "local",
        sourceId: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setCards((current) => [...current, localCard]);
      openCard(localCard);
      setNewCardForm(emptyCardForm);
      setShowNewCard(false);
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from("service_board_cards")
      .insert({
        board_id: board.id,
        ...payload,
      })
      .select(
        "id, board_id, column_id, card_number, title, description, priority, customer_name, location_name, assigned_to_profile_id, assigned_to_name, due_date, sort_order, tags, source_type, source_id, archived_at, created_at, updated_at"
      )
      .single();

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const createdCard = mapCard(data as CardRow);
    await logActivity(createdCard.id, "created_card", null, { title: createdCard.title });
    openCard(createdCard);
    setNewCardForm(emptyCardForm);
    setShowNewCard(false);
    await loadBoard();
  }

  function startNewCardForColumn(column: BoardColumn) {
    setNewCardForm({ ...emptyCardForm, columnId: column.id, locationName: column.title });
    setShowNewCard(true);
    setShowNewColumn(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function createColumn() {
    if (!newColumnForm.title.trim()) {
      setMessage("Add a lane title first.");
      return;
    }

    const key = slugifyColumnKey(newColumnForm.title, new Set(columns.map((column) => column.key)));
    const nextSort = Math.max(0, ...columns.map((column) => column.sortOrder)) + 100;
    const payload = {
      column_key: key,
      title: newColumnForm.title.trim(),
      description: newColumnForm.description.trim() || "Custom operations lane.",
      color: newColumnForm.color || "#fb923c",
      sort_order: nextSort,
      active: true,
    };

    if (!schemaReady || !board) {
      setColumns((current) => [
        ...current,
        {
          id: `local-column-${key}`,
          boardId: "local-board",
          key,
          title: payload.title,
          description: payload.description,
          color: payload.color,
          sortOrder: payload.sort_order,
        },
      ]);
      setNewColumnForm(emptyColumnForm);
      setShowNewColumn(false);
      setMessage("Added this test lane locally. Run the SQL to persist lanes and realtime movement.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("service_board_columns").insert({
      board_id: board.id,
      ...payload,
    });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await supabase.from("service_board_activity").insert({
      board_id: board.id,
      card_id: null,
      action: "created_lane",
      user_id: currentUserId || null,
      user_name: currentUserName,
      before_value: null,
      after_value: { title: payload.title },
    });
    setNewColumnForm(emptyColumnForm);
    setShowNewColumn(false);
    await loadBoard();
  }

  function startEditColumn(column: BoardColumn) {
    setEditingColumnId(column.id);
    setEditColumnForm({
      title: column.title,
      description: column.description,
      color: column.color || "#fb923c",
    });
    setShowNewColumn(false);
    setShowNewCard(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function updateColumn() {
    const column = columns.find((item) => item.id === editingColumnId);
    if (!column) return;
    if (!editColumnForm.title.trim()) {
      setMessage("List title is required.");
      return;
    }

    const patch = {
      title: editColumnForm.title.trim(),
      description: editColumnForm.description.trim() || "Custom operations lane.",
      color: editColumnForm.color || "#fb923c",
    };

    if (!schemaReady) {
      setColumns((current) =>
        current.map((item) =>
          item.id === column.id
            ? {
                ...item,
                ...patch,
              }
            : item
        )
      );
      setEditingColumnId("");
      setEditColumnForm(emptyColumnForm);
      setMessage("Updated this test list locally. Run the SQL to persist boards and realtime movement.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("service_board_columns").update(patch).eq("id", column.id);
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await logActivity(null, "updated_lane", { title: column.title }, { title: patch.title });
    setEditingColumnId("");
    setEditColumnForm(emptyColumnForm);
    await loadBoard();
  }

  async function archiveColumn(column: BoardColumn) {
    const cardCount = cards.filter((card) => card.columnId === column.id).length;
    const confirmed = window.confirm(`Archive "${column.title}" and hide ${cardCount} card${cardCount === 1 ? "" : "s"} in this list?`);
    if (!confirmed) return;

    if (!schemaReady) {
      setColumns((current) => current.filter((item) => item.id !== column.id));
      setCards((current) => current.filter((card) => card.columnId !== column.id));
      if (selectedCard?.columnId === column.id) setSelectedCardId("");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("service_board_columns").update({ active: false }).eq("id", column.id);
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await logActivity(null, "archived_lane", { title: column.title, cards: cardCount }, { active: false });
    if (selectedCard?.columnId === column.id) setSelectedCardId("");
    await loadBoard();
  }

  async function moveColumn(activeColumnId: string, overColumnId: string) {
    if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) return;

    const orderedColumns = [...columns].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const oldIndex = orderedColumns.findIndex((column) => column.id === activeColumnId);
    const newIndex = orderedColumns.findIndex((column) => column.id === overColumnId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const activeColumn = orderedColumns[oldIndex];
    const reorderedColumns = arrayMove(orderedColumns, oldIndex, newIndex).map((column, index) => ({
      ...column,
      sortOrder: (index + 1) * 100,
    }));

    setColumns(reorderedColumns);

    if (!schemaReady) return;

    setSaving(true);
    const results = await Promise.all(
      reorderedColumns.map((column) =>
        supabase.from("service_board_columns").update({ sort_order: column.sortOrder }).eq("id", column.id)
      )
    );
    setSaving(false);

    const error = results.find((result) => result.error)?.error;
    if (error) {
      setMessage(error.message);
      await loadBoard();
      return;
    }

    await logActivity(null, "moved_lane", { title: activeColumn.title, position: oldIndex + 1 }, { position: newIndex + 1 });
  }

  async function updateCard() {
    if (!selectedCard || !cardForm.title.trim()) {
      setMessage("Card title is required.");
      return;
    }

    const patch = cardPatchFromForm(cardForm, profiles);

    if (!schemaReady) {
      setCards((current) =>
        current.map((card) =>
          card.id === selectedCard.id
            ? {
                ...card,
                title: patch.title,
                description: patch.description ?? "",
                priority: patch.priority,
                customerName: patch.customer_name ?? "",
                locationName: patch.location_name ?? "",
                assignedToProfileId: patch.assigned_to_profile_id ?? "",
                assignedToName: patch.assigned_to_name ?? "",
                dueDate: patch.due_date ?? "",
                tags: patch.tags,
                updatedAt: new Date().toISOString(),
              }
            : card
        )
      );
      setMessage("Updated this test card locally. Run the SQL to persist it.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("service_board_cards").update(patch).eq("id", selectedCard.id);
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await logActivity(selectedCard.id, "updated_card", { title: selectedCard.title }, { title: patch.title });
    await loadBoard();
    setMessage("Card saved.");
  }

  function getInsertedSortOrder(card: BoardCard, destinationColumnId: string, beforeCardId?: string) {
    const targetCards = cards
      .filter((item) => item.columnId === destinationColumnId && item.id !== card.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const beforeIndex = beforeCardId ? targetCards.findIndex((item) => item.id === beforeCardId) : -1;

    if (beforeIndex < 0) return Math.max(0, ...targetCards.map((item) => item.sortOrder)) + 100;

    const previous = targetCards[beforeIndex - 1];
    const next = targetCards[beforeIndex];
    if (!previous) return next.sortOrder - 100;

    const gap = next.sortOrder - previous.sortOrder;
    return gap > 1 ? previous.sortOrder + Math.floor(gap / 2) : next.sortOrder - 1;
  }

  async function moveCard(card: BoardCard, destinationColumnId: string, beforeCardId?: string) {
    if (!destinationColumnId) return;

    const fromColumn = columns.find((column) => column.id === card.columnId);
    const toColumn = columns.find((column) => column.id === destinationColumnId);
    const nextSort = getInsertedSortOrder(card, destinationColumnId, beforeCardId);

    if (card.columnId === destinationColumnId && nextSort === card.sortOrder) return;

    setCards((current) =>
      current.map((item) =>
        item.id === card.id ? { ...item, columnId: destinationColumnId, sortOrder: nextSort, updatedAt: new Date().toISOString() } : item
      )
    );

    if (!schemaReady) return;

    const { error } = await supabase
      .from("service_board_cards")
      .update({ column_id: destinationColumnId, sort_order: nextSort })
      .eq("id", card.id);

    if (error) {
      setMessage(error.message);
      await loadBoard();
      return;
    }

    await logActivity(card.id, "moved_card", { column: fromColumn?.title ?? "" }, { column: toColumn?.title ?? "" });
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    const activeType = event.active.data.current?.type;
    if (activeType === "column") {
      const columnId = String(event.active.data.current?.columnId ?? "").replace("lane:", "");
      setActiveDragColumn(columns.find((column) => column.id === columnId) ?? null);
      setActiveDragCard(null);
      return;
    }

    setActiveDragCard(cards.find((card) => card.id === activeId) ?? null);
    setActiveDragColumn(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragCard(null);
    setActiveDragColumn(null);
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    const activeType = event.active.data.current?.type;

    if (activeType === "column") {
      const activeColumnId = String(event.active.data.current?.columnId ?? "").replace("lane:", "");
      const overColumnId = overId.startsWith("lane:")
        ? overId.replace("lane:", "")
        : overId.startsWith("column:")
          ? overId.replace("column:", "")
          : cards.find((item) => item.id === overId)?.columnId ?? "";
      await moveColumn(activeColumnId, overColumnId);
      return;
    }

    const card = cards.find((item) => item.id === activeId);
    if (!card || !overId) return;
    if (overId === activeId) return;

    if (overId.startsWith("column:")) {
      await moveCard(card, overId.replace("column:", ""));
      return;
    }

    if (overId.startsWith("lane:")) {
      await moveCard(card, overId.replace("lane:", ""));
      return;
    }

    const overCard = cards.find((item) => item.id === overId);
    if (!overCard) return;
    await moveCard(card, overCard.columnId, overCard.id);
  }

  async function sendToBullpen(card: BoardCard) {
    if (!bullpenColumn) {
      setMessage("No Bullpen list is available on this board.");
      return;
    }

    await moveCard(card, bullpenColumn.id);
  }

  async function archiveCard() {
    if (!selectedCard) return;

    if (!schemaReady) {
      setCards((current) => current.filter((card) => card.id !== selectedCard.id));
      setSelectedCardId("");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("service_board_cards").update({ archived_at: new Date().toISOString() }).eq("id", selectedCard.id);
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await logActivity(selectedCard.id, "archived_card", { title: selectedCard.title }, { archived: true });
    setSelectedCardId("");
    await loadBoard();
  }

  async function addComment() {
    if (!selectedCard || !newComment.trim()) return;
    if (!schemaReady) {
      setComments((current) => [
        {
          id: `local-comment-${Date.now()}`,
          card_id: selectedCard.id,
          body: newComment.trim(),
          created_by_name: currentUserName,
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setNewComment("");
      return;
    }

    const { error } = await supabase.from("service_board_card_comments").insert({
      card_id: selectedCard.id,
      created_by: currentUserId || null,
      created_by_name: currentUserName,
      body: newComment.trim(),
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await logActivity(selectedCard.id, "commented", null, { body: newComment.trim().slice(0, 80) });
    setNewComment("");
    await loadCardDetails(selectedCard.id);
  }

  async function addChecklistItem() {
    if (!selectedCard || !newChecklistItem.trim()) return;
    const nextSort = Math.max(0, ...checklist.map((item) => Number(item.sort_order ?? 0))) + 100;

    if (!schemaReady) {
      setChecklist((current) => [
        ...current,
        {
          id: `local-check-${Date.now()}`,
          card_id: selectedCard.id,
          label: newChecklistItem.trim(),
          is_done: false,
          sort_order: nextSort,
        },
      ]);
      setNewChecklistItem("");
      return;
    }

    const { error } = await supabase.from("service_board_card_checklist").insert({
      card_id: selectedCard.id,
      label: newChecklistItem.trim(),
      sort_order: nextSort,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewChecklistItem("");
    await loadCardDetails(selectedCard.id);
  }

  async function toggleChecklistItem(item: ChecklistRow) {
    if (!selectedCard) return;
    const nextValue = !item.is_done;
    setChecklist((current) => current.map((row) => (row.id === item.id ? { ...row, is_done: nextValue } : row)));

    if (!schemaReady) return;

    const { error } = await supabase.from("service_board_card_checklist").update({ is_done: nextValue }).eq("id", item.id);
    if (error) {
      setMessage(error.message);
      await loadCardDetails(selectedCard.id);
    }
  }

  const currentColumnId = selectedCard?.columnId ?? "";

  return (
    <main className={`${styles.shell} service-lines-shell`}>
      <header className={styles.header}>
        <button className={`brand compact brand-home-link ${styles.brand}`} type="button" onClick={() => navigate("/home")}>
          <img className="brand-logo" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">TITAN by Pathfinder Inspections</div>
          </div>
        </button>

        <div className={styles.headerActions}>
          <button className="button" type="button" onClick={() => navigate(config.backHref)}>
            Back
          </button>
          <button className="button" type="button" onClick={() => void loadBoard()}>
            Refresh
          </button>
          {config.primaryHref && (
            <button className="button primary" type="button" onClick={() => navigate(config.primaryHref || "/service-lines")}>
              {config.primaryLabel}
            </button>
          )}
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <span>{config.eyebrow}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <div className={styles.statusCluster}>
          <span className={schemaReady ? styles.livePill : styles.testPill}>{schemaReady ? "Realtime ready" : "Test mode"}</span>
          <button className="button" type="button" onClick={() => setShowNewColumn((open) => !open)}>
            New List
          </button>
          <button
            className="button primary"
            type="button"
            onClick={() => {
              setNewCardForm((current) => ({ ...current, columnId: current.columnId || columns[0]?.id || "" }));
              setShowNewCard((open) => !open);
              setShowNewColumn(false);
            }}
          >
            New Card
          </button>
        </div>
      </section>

      <nav className={styles.boardSwitch} aria-label="Service line boards">
        {serviceLineBoardKeys.map((key) => {
          const option = serviceLineBoardConfigs[key];
          return (
            <button
              key={key}
              type="button"
              className={key === boardKey ? styles.activeBoard : ""}
              onClick={() => navigate(`/service-lines/boards/${key}`)}
            >
              {option.serviceLineKey.toUpperCase()}
            </button>
          );
        })}
      </nav>

      {message && <div className={styles.message}>{message}</div>}

      <section className={styles.boardToolbar} aria-label="Board tools">
        <label>
          Search board
          <input
            value={boardSearch}
            onChange={(event) => setBoardSearch(event.target.value)}
            placeholder="Search cards, lanes, roles, crew, truck, rig..."
          />
        </label>
        {boardSearch && (
          <button className="button" type="button" onClick={() => setBoardSearch("")}>
            Clear
          </button>
        )}
      </section>

      {showNewColumn && (
        <section className={styles.newCardPanel}>
          <div>
            <span className={styles.sectionLabel}>New List</span>
            <h2>Create a board lane</h2>
          </div>
          <div className={styles.formGrid}>
            <label>
              List title
              <input
                value={newColumnForm.title}
                onChange={(event) => setNewColumnForm({ ...newColumnForm, title: event.target.value })}
                placeholder="Rig, crew, truck group, off schedule..."
              />
            </label>
            <label>
              Color
              <input
                type="color"
                value={newColumnForm.color}
                onChange={(event) => setNewColumnForm({ ...newColumnForm, color: event.target.value })}
              />
            </label>
            <label className={styles.fullField}>
              Description
              <input
                value={newColumnForm.description}
                onChange={(event) => setNewColumnForm({ ...newColumnForm, description: event.target.value })}
                placeholder="Optional note for this lane"
              />
            </label>
          </div>
          <div className={styles.inlineActions}>
            <button className="button primary" type="button" disabled={saving} onClick={() => void createColumn()}>
              Create List
            </button>
            <button className="button" type="button" onClick={() => setShowNewColumn(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {editingColumnId && (
        <section className={styles.newCardPanel}>
          <div>
            <span className={styles.sectionLabel}>Edit List</span>
            <h2>Update job lane</h2>
          </div>
          <div className={styles.formGrid}>
            <label>
              List title
              <input
                value={editColumnForm.title}
                onChange={(event) => setEditColumnForm({ ...editColumnForm, title: event.target.value })}
                placeholder="Rig, crew, truck group, off schedule..."
              />
            </label>
            <label>
              Color
              <input
                type="color"
                value={editColumnForm.color}
                onChange={(event) => setEditColumnForm({ ...editColumnForm, color: event.target.value })}
              />
            </label>
            <label className={styles.fullField}>
              Description
              <input
                value={editColumnForm.description}
                onChange={(event) => setEditColumnForm({ ...editColumnForm, description: event.target.value })}
                placeholder="Optional note for this lane"
              />
            </label>
          </div>
          <div className={styles.inlineActions}>
            <button className="button primary" type="button" disabled={saving} onClick={() => void updateColumn()}>
              Save List
            </button>
            <button
              className="button"
              type="button"
              onClick={() => {
                setEditingColumnId("");
                setEditColumnForm(emptyColumnForm);
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className={styles.kpis} aria-label="Board summary">
        <div>
          <span>Lists</span>
          <strong>{boardStats.lists}</strong>
        </div>
        <div>
          <span>Cards</span>
          <strong>{boardStats.active}</strong>
        </div>
        <div>
          <span>Visible</span>
          <strong>{boardStats.visible}</strong>
        </div>
        <div>
          <span>Assigned</span>
          <strong>{boardStats.assigned}</strong>
        </div>
      </section>

      {showNewCard && (
        <section className={styles.newCardPanel}>
          <div>
            <span className={styles.sectionLabel}>New Work Card</span>
            <h2>Create a card</h2>
          </div>
          <div className={styles.formGrid}>
            <label>
              Title
              <input value={newCardForm.title} onChange={(event) => setNewCardForm({ ...newCardForm, title: event.target.value })} placeholder="Customer, job, or work request" />
            </label>
            <label>
              List
              <select value={newCardForm.columnId} onChange={(event) => setNewCardForm({ ...newCardForm, columnId: event.target.value })}>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select value={newCardForm.priority} onChange={(event) => setNewCardForm({ ...newCardForm, priority: event.target.value as BoardCard["priority"] })}>
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Customer
              <input value={newCardForm.customerName} onChange={(event) => setNewCardForm({ ...newCardForm, customerName: event.target.value })} placeholder="Customer or operator" />
            </label>
            <label>
              Location
              <input value={newCardForm.locationName} onChange={(event) => setNewCardForm({ ...newCardForm, locationName: event.target.value })} placeholder="Yard, rig, shop, or job site" />
            </label>
            <label>
              Assigned to
              <select value={newCardForm.assignedToProfileId} onChange={(event) => setNewCardForm({ ...newCardForm, assignedToProfileId: event.target.value })}>
                <option value="">Unassigned</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.fullName} ({profile.role})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input type="date" value={newCardForm.dueDate} onChange={(event) => setNewCardForm({ ...newCardForm, dueDate: event.target.value })} />
            </label>
            <label className={styles.fullField}>
              Tags
              <input value={newCardForm.tagsText} onChange={(event) => setNewCardForm({ ...newCardForm, tagsText: event.target.value })} placeholder="urgent, yard, customer call" />
            </label>
            <label className={styles.fullField}>
              Description
              <textarea value={newCardForm.description} onChange={(event) => setNewCardForm({ ...newCardForm, description: event.target.value })} placeholder="What needs to happen?" />
            </label>
          </div>
          <div className={styles.inlineActions}>
            <button className="button primary" type="button" disabled={saving} onClick={() => void createCard()}>
              Create Card
            </button>
            <button className="button" type="button" onClick={() => setShowNewCard(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={(event) => void handleDragEnd(event)}>
        <section className={styles.deck} aria-label={`${config.title} columns`}>
          {loading ? (
            <div className={styles.loading}>Loading board...</div>
          ) : (
            <SortableContext items={columns.map((column) => `lane:${column.id}`)} strategy={horizontalListSortingStrategy}>
              {columns.map((column) => (
                <DroppableColumn
                  key={column.id}
                  column={column}
                  cards={cardsByColumn.get(column.id) ?? []}
                  selectedCardId={selectedCardId}
                  onSelectCard={openCard}
                  onAddCard={startNewCardForColumn}
                  onEditColumn={startEditColumn}
                  onArchiveColumn={(columnToArchive) => void archiveColumn(columnToArchive)}
                  onSendToBullpen={(card) => void sendToBullpen(card)}
                  bullpenColumnId={bullpenColumn?.id ?? ""}
                />
              ))}
            </SortableContext>
          )}
        </section>
        <DragOverlay>
          {activeDragCard && (
            <div className={`${styles.card} ${styles.dragOverlay}`}>
              <span className={styles.cardNumber}>{activeDragCard.cardNumber}</span>
              <strong>{activeDragCard.title}</strong>
              <small>{activeDragCard.customerName || activeDragCard.locationName || "Moving card"}</small>
            </div>
          )}
          {activeDragColumn && (
            <div className={`${styles.column} ${styles.columnOverlay}`}>
              <header className={styles.columnHead} style={{ borderTopColor: activeDragColumn.color }}>
                <div>
                  <h2>{activeDragColumn.title}</h2>
                  <p>{activeDragColumn.description}</p>
                </div>
              </header>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {selectedCard && (
        <aside className={styles.detailDrawer} aria-label="Card detail">
          <div className={styles.drawerHead}>
            <div>
              <span>{selectedCard.cardNumber}</span>
              <h2>{selectedCard.title}</h2>
              <p>{columns.find((column) => column.id === selectedCard.columnId)?.title ?? "Board card"}</p>
            </div>
            <button type="button" onClick={() => setSelectedCardId("")} aria-label="Close card">
              X
            </button>
          </div>

          <div className={styles.drawerGrid}>
            <label>
              Title
              <input value={cardForm.title} onChange={(event) => setCardForm({ ...cardForm, title: event.target.value })} />
            </label>
            <label>
              Column
              <select value={currentColumnId} onChange={(event) => void moveCard(selectedCard, event.target.value)}>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select value={cardForm.priority} onChange={(event) => setCardForm({ ...cardForm, priority: event.target.value as BoardCard["priority"] })}>
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assigned to
              <select value={cardForm.assignedToProfileId} onChange={(event) => setCardForm({ ...cardForm, assignedToProfileId: event.target.value })}>
                <option value="">Unassigned</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.fullName} ({profile.role})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Customer
              <input value={cardForm.customerName} onChange={(event) => setCardForm({ ...cardForm, customerName: event.target.value })} />
            </label>
            <label>
              Location
              <input value={cardForm.locationName} onChange={(event) => setCardForm({ ...cardForm, locationName: event.target.value })} />
            </label>
            <label>
              Due date
              <input type="date" value={cardForm.dueDate} onChange={(event) => setCardForm({ ...cardForm, dueDate: event.target.value })} />
            </label>
            <label>
              Tags
              <input value={cardForm.tagsText} onChange={(event) => setCardForm({ ...cardForm, tagsText: event.target.value })} />
            </label>
            <label className={styles.fullField}>
              Description
              <textarea value={cardForm.description} onChange={(event) => setCardForm({ ...cardForm, description: event.target.value })} />
            </label>
          </div>

          <div className={styles.inlineActions}>
            <button className="button primary" type="button" disabled={saving} onClick={() => void updateCard()}>
              Save Card
            </button>
            <button className="button" type="button" disabled={saving} onClick={() => void archiveCard()}>
              Archive
            </button>
          </div>

          <section className={styles.drawerSection}>
            <h3>Checklist</h3>
            <div className={styles.addLine}>
              <input value={newChecklistItem} onChange={(event) => setNewChecklistItem(event.target.value)} placeholder="Add checklist item" />
              <button className="button" type="button" onClick={() => void addChecklistItem()}>
                Add
              </button>
            </div>
            <div className={styles.checklist}>
              {checklist.length === 0 ? (
                <p>No checklist items yet.</p>
              ) : (
                checklist.map((item) => (
                  <label key={item.id} className={styles.checkItem}>
                    <input type="checkbox" checked={Boolean(item.is_done)} onChange={() => void toggleChecklistItem(item)} />
                    <span>{item.label}</span>
                  </label>
                ))
              )}
            </div>
          </section>

          <section className={styles.drawerSection}>
            <h3>Comments</h3>
            <div className={styles.addLine}>
              <input value={newComment} onChange={(event) => setNewComment(event.target.value)} placeholder="Add update or handoff note" />
              <button className="button" type="button" onClick={() => void addComment()}>
                Post
              </button>
            </div>
            <div className={styles.commentList}>
              {comments.length === 0 ? (
                <p>No comments yet.</p>
              ) : (
                comments.map((comment) => (
                  <article key={comment.id}>
                    <strong>{comment.created_by_name || "TITAN user"}</strong>
                    <span>{formatTime(comment.created_at)}</span>
                    <p>{comment.body}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className={styles.drawerSection}>
            <h3>Activity</h3>
            <div className={styles.activityList}>
              {activity.length === 0 ? (
                <p>No activity yet.</p>
              ) : (
                activity.map((item) => (
                  <article key={item.id}>
                    <strong>{item.action.replace(/_/g, " ")}</strong>
                    <span>{item.user_name || "System"} / {formatTime(item.created_at)}</span>
                  </article>
                ))
              )}
            </div>
          </section>
        </aside>
      )}
    </main>
  );
}

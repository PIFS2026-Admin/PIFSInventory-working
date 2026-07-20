export type ServiceLineBoardKey = "dti" | "hardbanding" | "cdt" | "tubing" | "hotshot";

import {
  trelloRoleLabelColors,
  wtxOperationsBoardColumns,
  wtxOperationsBoardStarterCards,
} from "./wtxOperationsBoardSeed";

export type ServiceLineBoardColumnConfig = {
  key: string;
  title: string;
  description: string;
  color: string;
};

export type ServiceLineBoardStarterCard = {
  title: string;
  description: string;
  priority: "Low" | "Normal" | "High" | "Critical";
  customerName?: string;
  locationName?: string;
  tags: string[];
  columnKey: string;
};

export type ServiceLineBoardConfig = {
  key: ServiceLineBoardKey;
  serviceLineKey: string;
  title: string;
  eyebrow: string;
  description: string;
  backHref: string;
  primaryHref?: string;
  primaryLabel?: string;
  columns: ServiceLineBoardColumnConfig[];
  starterCards: ServiceLineBoardStarterCard[];
};

export const serviceLineBoardConfigs: Record<ServiceLineBoardKey, ServiceLineBoardConfig> = {
  dti: {
    key: "dti",
    serviceLineKey: "dti",
    title: "Operations Board",
    eyebrow: "Live Operations Board",
    description: "Trello-style operations board for trucks, trailers, rigs, crews, off-schedule people, and bullpen movement.",
    backHref: "/service-lines/dti",
    primaryHref: "/dti",
    primaryLabel: "DTI Jobs",
    columns: wtxOperationsBoardColumns,
    starterCards: wtxOperationsBoardStarterCards,
  },
  hardbanding: {
    key: "hardbanding",
    serviceLineKey: "hardbanding",
    title: "Hardbanding Work Board",
    eyebrow: "Service Line Board",
    description: "Track hardband work from quote and scheduling through QC, closeout, and invoicing.",
    backHref: "/service-lines/hardbanding",
    primaryHref: "/hardband",
    primaryLabel: "Hardband Jobs",
    columns: [
      { key: "quoted", title: "Quoted", description: "Pricing or scope is being confirmed.", color: "#fb923c" },
      { key: "scheduled", title: "Scheduled", description: "Crew, customer, and location are set.", color: "#60a5fa" },
      { key: "on_location", title: "On Location", description: "Crew is mobilized or staged.", color: "#f59e0b" },
      { key: "in_progress", title: "In Progress", description: "Hardbanding is active.", color: "#facc15" },
      { key: "qc_review", title: "QC Review", description: "Closeout data and quality review.", color: "#a78bfa" },
      { key: "complete", title: "Complete", description: "Work is complete.", color: "#34d399" },
    ],
    starterCards: [
      {
        title: "Hardband test job",
        description: "Move this through the board to validate the workflow.",
        priority: "Normal",
        customerName: "Demo customer",
        locationName: "Shop",
        tags: ["hardband"],
        columnKey: "quoted",
      },
    ],
  },
  cdt: {
    key: "cdt",
    serviceLineKey: "cdt",
    title: "CDT Work Board",
    eyebrow: "Service Line Board",
    description: "Stage CDT work from request through execution, review, and completion.",
    backHref: "/service-lines/cdt",
    columns: [
      { key: "requested", title: "Requested", description: "New CDT work requests.", color: "#fb923c" },
      { key: "scheduled", title: "Scheduled", description: "Work has been planned.", color: "#60a5fa" },
      { key: "in_progress", title: "In Progress", description: "CDT work is underway.", color: "#facc15" },
      { key: "review", title: "Review", description: "Final checks or paperwork.", color: "#a78bfa" },
      { key: "complete", title: "Complete", description: "Work is done.", color: "#34d399" },
    ],
    starterCards: [
      {
        title: "CDT workflow placeholder",
        description: "Use this until the CDT production module is built.",
        priority: "Normal",
        tags: ["cdt"],
        columnKey: "requested",
      },
    ],
  },
  tubing: {
    key: "tubing",
    serviceLineKey: "tubing",
    title: "Tubing Work Board",
    eyebrow: "Service Line Board",
    description: "Track tubing service work across scheduling, production, review, and closeout.",
    backHref: "/service-lines/tubing",
    columns: [
      { key: "requested", title: "Requested", description: "New tubing requests.", color: "#fb923c" },
      { key: "scheduled", title: "Scheduled", description: "Work has been scheduled.", color: "#60a5fa" },
      { key: "in_progress", title: "In Progress", description: "Work is active.", color: "#facc15" },
      { key: "review", title: "Review", description: "Needs review or paperwork.", color: "#a78bfa" },
      { key: "complete", title: "Complete", description: "Work is complete.", color: "#34d399" },
    ],
    starterCards: [
      {
        title: "Tubing workflow placeholder",
        description: "Use this until tubing forms and production records are connected.",
        priority: "Normal",
        tags: ["tubing"],
        columnKey: "requested",
      },
    ],
  },
  hotshot: {
    key: "hotshot",
    serviceLineKey: "hotshot",
    title: "Hotshot Work Board",
    eyebrow: "Service Line Board",
    description: "Dispatch hotshot work from request through pickup, transit, delivery, and closeout.",
    backHref: "/service-lines/hotshot",
    columns: [
      { key: "requested", title: "Requested", description: "New hotshot requests.", color: "#fb923c" },
      { key: "assigned", title: "Assigned", description: "Driver or unit assigned.", color: "#60a5fa" },
      { key: "pickup", title: "Pickup", description: "Pickup is underway.", color: "#f59e0b" },
      { key: "in_transit", title: "In Transit", description: "Load is moving.", color: "#facc15" },
      { key: "delivered", title: "Delivered", description: "Delivered and awaiting closeout.", color: "#34d399" },
      { key: "closed", title: "Closed", description: "Ticket and billing are closed.", color: "#94a3b8" },
    ],
    starterCards: [
      {
        title: "Hotshot workflow placeholder",
        description: "Use this until hotshot dispatch records are connected.",
        priority: "Normal",
        tags: ["dispatch"],
        columnKey: "requested",
      },
    ],
  },
};

export const serviceLineBoardTagColors = trelloRoleLabelColors;

export const serviceLineBoardKeys = Object.keys(serviceLineBoardConfigs) as ServiceLineBoardKey[];

export function isServiceLineBoardKey(value: string): value is ServiceLineBoardKey {
  return serviceLineBoardKeys.includes(value as ServiceLineBoardKey);
}

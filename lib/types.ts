export type UserRole =
  | "admin"
  | "employee"
  | "customer"
  | "operator"
  | "sales"
  | "dti_superintendent"
  | "dti_inspector"
  | "inventory_specialist"
  | "inventory_manager";
export type PipeRange = "Range 2" | "Range 3";

export type InventoryStatus =
  | "Received"
  | "Available"
  | "WIP"
  | "Awaiting Inspection"
  | "Awaiting Ship"
  | "Shipped"
  | "Rejected"
  | "Scrap"
  | "On Hold";

export type Rack = {
  id: string;
  rack_code: string;
  capacity_joints: number;
  sort_order: number;
};

export type WorkflowZone = {
  id: string;
  name: string;
  code: string;
  sort_order: number;
};

export type PipeInventory = {
  id: string;
  company_id: string;
  yard_id: string;
  rack_id: string | null;
  workflow_zone_id: string | null;
  company_name: string;
  afe: string;
  part_number: string;
  size: string;
  grade: string;
  connection: string;
  pipe_range: PipeRange;
  condition: string;
  status: InventoryStatus;
  inspection_color: string;
  inspection_due_date: string;
  bulk_joints: number;
  bulk_footage: number;
  tallied_joints: number;
  tallied_footage: number;
  total_joints: number;
  total_footage: number;
  created_at: string;
};

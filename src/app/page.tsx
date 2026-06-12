'use client';

import { useMemo, useState } from 'react';

type Role = 'admin' | 'employee' | 'customer';
type LocationType = 'rack' | 'zone';

type RackConfig = {
  id: string;
  label: string;
  capacity: number;
};

type InventoryRow = {
  id: string;
  company: string;
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  status: string;
  condition: string;
  rackId: string | null;
  zoneId: string | null;
  inspectionDue: string;
  bulkJoints: number;
  bulkFootage: number;
  talliedJoints: number;
  talliedFootage: number;
  createdAt: string;
};

const defaultRacks: RackConfig[] = Array.from(
  { length: 101 },
  (_, index) => 200 + index
).flatMap((rack) => [
  { id: `${rack}A`, label: `${rack}A`, capacity: 500 },
  { id: `${rack}B`, label: `${rack}B`, capacity: 500 },
]);

const zones = [
  { id: 'shipping', name: 'Shipping' },
  { id: 'receiving', name: 'Receiving' },
  { id: 'water_blaster', name: 'Water Blaster' },
  { id: 'inspection', name: 'Inspection' },
  { id: 'hardband', name: 'Hardband' },
  { id: 'machine_shop', name: 'Machine Shop' },
  { id: 'warehouse', name: 'Warehouse' },
];

const starterInventory: InventoryRow[] = [
  {
    id: 'INV-1001',
    company: 'CP Energy',
    afe: '56886-C',
    partNumber: '2 3/8 J55 8rd EUE',
    size: '2 3/8"',
    grade: 'J55',
    connection: '8 Round EUE',
    status: 'Received',
    condition: 'New',
    rackId: '200A',
    zoneId: null,
    inspectionDue: '2026-09-15',
    bulkJoints: 500,
    bulkFootage: 15500,
    talliedJoints: 0,
    talliedFootage: 0,
    createdAt: '2026-06-11',
  },
  {
    id: 'INV-1002',
    company: 'CP Energy',
    afe: '56886-C',
    partNumber: 'PH6 Box',
    size: '2 7/8"',
    grade: 'L80',
    connection: 'PH6',
    status: 'Awaiting Inspection',
    condition: 'Premium',
    rackId: '200A',
    zoneId: null,
    inspectionDue: '2026-08-01',
    bulkJoints: 80,
    bulkFootage: 2480,
    talliedJoints: 0,
    talliedFootage: 0,
    createdAt: '2026-06-10',
  },
  {
    id: 'INV-1003',
    company: 'Acme Oil',
    afe: 'A-104',
    partNumber: 'NC50 Drill Pipe',
    size: '5"',
    grade: 'S135',
    connection: 'NC50',
    status: 'Available',
    condition: 'Used',
    rackId: '241B',
    zoneId: null,
    inspectionDue: '2026-11-22',
    bulkJoints: 210,
    bulkFootage: 6510,
    talliedJoints: 20,
    talliedFootage: 620,
    createdAt: '2026-06-08',
  },
  {
    id: 'INV-1004',
    company: 'CP Energy',
    afe: '56886-C',
    partNumber: 'NC46 Pin',
    size: '4 1/2"',
    grade: 'P110',
    connection: 'NC46',
    status: 'WIP',
    condition: 'Repair',
    rackId: null,
    zoneId: 'machine_shop',
    inspectionDue: '2026-07-05',
    bulkJoints: 30,
    bulkFootage: 930,
    talliedJoints: 0,
    talliedFootage: 0,
    createdAt: '2026-06-11',
  },
];

function totalJoints(row: InventoryRow) {
  return row.bulkJoints + row.talliedJoints;
}

function totalFootage(row: InventoryRow) {
  return row.bulkFootage + row.talliedFootage;
}

function locationName(row: InventoryRow) {
  if (row.rackId) return row.rackId;
  return zones.find((zone) => zone.id === row.zoneId)?.name ?? 'Unassigned';
}

export default function Home() {
  const [role, setRole] = useState<Role>('admin');
  const [inventory, setInventory] = useState(starterInventory);
  const [rackLayout, setRackLayout] = useState<RackConfig[]>(defaultRacks);
  const [layoutMode, setLayoutMode] = useState(false);
  const [draggedRackId, setDraggedRackId] = useState<string | null>(null);
  const [editingRackId, setEditingRackId] = useState<string | null>(null);
  const [editingRackLabel, setEditingRackLabel] = useState('');
  const [selectedType, setSelectedType] = useState<LocationType>('rack');
  const [selectedLocation, setSelectedLocation] = useState('200A');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferMode, setTransferMode] = useState<'choice' | 'partial'>('choice');
  const [destination, setDestination] = useState('shipping');
  const [moveJoints, setMoveJoints] = useState('');
  const [moveFootage, setMoveFootage] = useState('');
  const [comment, setComment] = useState('');
  const [ticketOpen, setTicketOpen] = useState<'receive' | 'ship' | null>(null);

  const isCustomer = role === 'customer';

  const visibleInventory = useMemo(() => {
    return inventory.filter((row) => {
      if (isCustomer && row.company !== 'CP Energy') return false;

      const matchesLocation =
        selectedType === 'rack'
          ? row.rackId === selectedLocation
          : row.zoneId === selectedLocation;

      const matchesSearch =
        !search ||
        `${row.company} ${row.afe} ${row.partNumber} ${row.status} ${row.condition}`
          .toLowerCase()
          .includes(search.toLowerCase());

      return matchesLocation && matchesSearch;
    });
  }, [inventory, isCustomer, search, selectedLocation, selectedType]);

  const rackCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const rack of rackLayout) {
      counts[rack.label] = 0;
    }

    for (const row of inventory) {
      if (row.rackId) {
        counts[row.rackId] = (counts[row.rackId] ?? 0) + totalJoints(row);
      }
    }

    return counts;
  }, [inventory, rackLayout]);

  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const zone of zones) counts[zone.id] = 0;

    for (const row of inventory) {
      if (row.zoneId) {
        counts[row.zoneId] = (counts[row.zoneId] ?? 0) + totalJoints(row);
      }
    }

    return counts;
  }, [inventory]);

  const selectedItems = inventory.filter((row) =>
    selectedRows.includes(row.id)
  );

  function selectLocation(type: LocationType, id: string) {
    setSelectedType(type);
    setSelectedLocation(id);
    setSelectedRows([]);
  }

  function toggleRow(id: string) {
    setSelectedRows((current) =>
      current.includes(id)
        ? current.filter((rowId) => rowId !== id)
        : [...current, id]
    );
  }

  function moveRack(targetRackId: string) {
    if (!draggedRackId || draggedRackId === targetRackId) return;

    setRackLayout((current) => {
      const draggedIndex = current.findIndex((rack) => rack.id === draggedRackId);
      const targetIndex = current.findIndex((rack) => rack.id === targetRackId);

      if (draggedIndex < 0 || targetIndex < 0) return current;

      const next = [...current];
      const [draggedRack] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedRack);

      return next;
    });

    setDraggedRackId(null);
  }

  function startEditRack(rack: RackConfig) {
    setEditingRackId(rack.id);
    setEditingRackLabel(rack.label);
  }

  function saveRackName() {
    if (!editingRackId || !editingRackLabel.trim()) return;

    const oldRack = rackLayout.find((rack) => rack.id === editingRackId);
    if (!oldRack) return;

    const newLabel = editingRackLabel.trim();

    setRackLayout((current) =>
      current.map((rack) =>
        rack.id === editingRackId ? { ...rack, label: newLabel } : rack
      )
    );

    setInventory((rows) =>
      rows.map((row) =>
        row.rackId === oldRack.label ? { ...row, rackId: newLabel } : row
      )
    );

    if (selectedType === 'rack' && selectedLocation === oldRack.label) {
      setSelectedLocation(newLabel);
    }

    setEditingRackId(null);
    setEditingRackLabel('');
  }

  function moveAll() {
    const destinationIsRack = rackLayout.some((rack) => rack.label === destination);

    setInventory((rows) =>
      rows.map((row) =>
        selectedRows.includes(row.id)
          ? {
              ...row,
              rackId: destinationIsRack ? destination : null,
              zoneId: destinationIsRack ? null : destination,
              status: 'WIP',
            }
          : row
      )
    );

    setSelectedRows([]);
    setTransferOpen(false);
  }

  function movePartial() {
    const source = selectedItems[0];
    if (!source) return;

    const joints = Number(moveJoints) || 0;
    const footage = Number(moveFootage) || 0;

    if (joints <= 0 && footage <= 0) return;
    if (joints > source.bulkJoints || footage > source.bulkFootage) return;

    const destinationIsRack = rackLayout.some((rack) => rack.label === destination);

    const newRow: InventoryRow = {
      ...source,
      id: `INV-${Date.now()}`,
      rackId: destinationIsRack ? destination : null,
      zoneId: destinationIsRack ? null : destination,
      bulkJoints: joints,
      bulkFootage: footage,
      talliedJoints: 0,
      talliedFootage: 0,
      status: 'WIP',
      createdAt: new Date().toISOString().slice(0, 10),
    };

    setInventory((rows) => [
      ...rows.map((row) =>
        row.id === source.id
          ? {
              ...row,
              bulkJoints: row.bulkJoints - joints,
              bulkFootage: row.bulkFootage - footage,
            }
          : row
      ),
      newRow,
    ]);

    setMoveJoints('');
    setMoveFootage('');
    setComment('');
    setSelectedRows([]);
    setTransferOpen(false);
  }

  function finishTicket() {
    if (ticketOpen === 'ship') {
      setInventory((rows) =>
        rows.map((row) =>
          selectedRows.includes(row.id) ? { ...row, status: 'Shipped' } : row
        )
      );
    }

    setTicketOpen(null);
    setSelectedRows([]);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">PF</div>
          <div>
            <div className="brand-title">PIFS Tubular Management</div>
            <div className="brand-subtitle">Modern pipe yard inventory</div>
          </div>
        </div>

        <select className="select">
          <option>Pathfinder Yard</option>
        </select>

        <input
          className="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search company, AFE, part number, status..."
        />

        <button className="button">Refresh</button>

        <select
          className="select"
          value={role}
          onChange={(event) => setRole(event.target.value as Role)}
        >
          <option value="admin">Admin</option>
          <option value="employee">Employee</option>
          <option value="customer">Customer View</option>
        </select>
      </header>

      <div className="workspace">
        <div className="action-bar">
          {[
            'New Master Part',
            'Save',
            'Print',
            'Refresh',
            'Highlight',
            'Show',
            'Checkpoint',
            'Complete',
            'Import',
          ].map((label) => (
            <button className="button" key={label} disabled={isCustomer}>
              {label}
            </button>
          ))}

          <button
            className="button primary"
            disabled={isCustomer || selectedRows.length === 0}
            onClick={() => {
              setTransferMode('choice');
              setTransferOpen(true);
            }}
          >
            Transfer
          </button>

          <button
            className="button"
            disabled={isCustomer}
            onClick={() => setTicketOpen('receive')}
          >
            Receive
          </button>

          <button
            className="button"
            disabled={isCustomer || selectedRows.length === 0}
            onClick={() => setTicketOpen('ship')}
          >
            Ship
          </button>

          <button className="button" disabled={isCustomer}>
            Adjust
          </button>
        </div>

        <section className="yard-layout">
          <div>
            <div className="yard-card">
              <div className="section-title">
                <h2>Rack Grid</h2>
                <button
                  className={`button ${layoutMode ? 'primary' : ''}`}
                  onClick={() => {
                    setLayoutMode((current) => !current);
                    setEditingRackId(null);
                    setDraggedRackId(null);
                  }}
                  disabled={isCustomer}
                >
                  {layoutMode ? 'Done Layout' : 'Edit Layout'}
                </button>
              </div>

              <div className="rack-grid">
                {rackLayout.map((rack) => {
                  const used = rackCounts[rack.label] ?? 0;
                  const percent = Math.min((used / rack.capacity) * 100, 100);
                  const active =
                    selectedType === 'rack' && selectedLocation === rack.label;
                  const isEditing = editingRackId === rack.id;

                  return (
                    <div
                      key={rack.id}
                      className={`rack-tile ${active ? 'active' : ''} ${
                        layoutMode ? 'layout-mode' : ''
                      }`}
                      draggable={layoutMode}
                      onDragStart={() => setDraggedRackId(rack.id)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => moveRack(rack.id)}
                    >
                      {isEditing ? (
                        <div className="rack-edit">
                          <input
                            value={editingRackLabel}
                            onChange={(event) =>
                              setEditingRackLabel(event.target.value)
                            }
                            autoFocus
                          />
                          <button className="mini-button" onClick={saveRackName}>
                            Save
                          </button>
                          <button
                            className="mini-button ghost"
                            onClick={() => {
                              setEditingRackId(null);
                              setEditingRackLabel('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          className="rack-tile-button"
                          onClick={() => {
                            if (!layoutMode) selectLocation('rack', rack.label);
                          }}
                        >
                          <div className="rack-code">
                            <span>{rack.label}</span>
                            <span className="badge orange">{used}</span>
                          </div>

                          <div className="capacity">
                            <span style={{ width: `${percent}%` }} />
                          </div>

                          <div className="rack-meta">
                            {used}/{rack.capacity} joints
                          </div>
                        </button>
                      )}

                      {layoutMode && !isEditing && (
                        <button
                          className="mini-button edit-rack"
                          onClick={() => startEditRack(rack)}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <section className="inventory-panel">
              <div className="section-title table-title">
                <h2>Inventory at {selectedLocation}</h2>
                <span>{visibleInventory.length} line items</span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Date Created</th>
                      <th>Inspection Due</th>
                      <th>Company</th>
                      <th>TU#</th>
                      <th>Part Number</th>
                      <th>Status</th>
                      <th>Condition</th>
                      <th>Rack/Location</th>
                      <th>Bulk Joints</th>
                      <th>Bulk Footage</th>
                      <th>Tallied Joint Count</th>
                      <th>Tallied Footage</th>
                      <th>Total Joint Count</th>
                      <th>Total Footage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleInventory.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="checkbox"
                            disabled={isCustomer}
                            checked={selectedRows.includes(row.id)}
                            onChange={() => toggleRow(row.id)}
                          />
                        </td>
                        <td>{row.createdAt}</td>
                        <td>{row.inspectionDue}</td>
                        <td>{row.company}</td>
                        <td>{row.afe}</td>
                        <td>{row.partNumber}</td>
                        <td>
                          <span className="badge orange">{row.status}</span>
                        </td>
                        <td>{row.condition}</td>
                        <td>{locationName(row)}</td>
                        <td>{row.bulkJoints}</td>
                        <td>{row.bulkFootage.toLocaleString()}</td>
                        <td>{row.talliedJoints}</td>
                        <td>{row.talliedFootage.toLocaleString()}</td>
                        <td>{totalJoints(row)}</td>
                        <td>{totalFootage(row).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {visibleInventory.length === 0 && (
                  <div className="empty-state">
                    No inventory found for this location.
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="side-panel">
            <div className="section-title">
              <h2>Work Zones</h2>
              <span>Touch to filter</span>
            </div>

            <div className="zone-grid">
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  className={`zone-tile ${
                    selectedType === 'zone' && selectedLocation === zone.id
                      ? 'active'
                      : ''
                  }`}
                  onClick={() => selectLocation('zone', zone.id)}
                >
                  <div className="rack-code">
                    <span>{zone.name}</span>
                    <span className="badge">{zoneCounts[zone.id] ?? 0}</span>
                  </div>
                  <div className="rack-meta">{zone.id.replace('_', ' ')}</div>
                </button>
              ))}
            </div>

            <div className="side-spacer" />

            <div className="section-title">
              <h2>Selection</h2>
              <span>{selectedRows.length} lines</span>
            </div>

            <div className="metric-list">
              <div className="metric">
                <strong>
                  {selectedItems.reduce(
                    (sum, row) => sum + totalJoints(row),
                    0
                  )}
                </strong>
                <span>Selected joints</span>
              </div>

              <div className="metric">
                <strong>
                  {selectedItems
                    .reduce((sum, row) => sum + totalFootage(row), 0)
                    .toLocaleString()}
                </strong>
                <span>Selected footage</span>
              </div>

              <div className="metric">
                <strong>{selectedLocation}</strong>
                <span>Current location</span>
              </div>
            </div>
          </aside>
        </section>
      </div>

      {transferOpen && (
        <div className="slide-over-backdrop">
          <section className="slide-over">
            <div className="section-title">
              <h2>Transfer Inventory</h2>
              <button
                className="button ghost"
                onClick={() => setTransferOpen(false)}
              >
                Close
              </button>
            </div>

            {transferMode === 'choice' ? (
              <div className="option-stack">
                <button className="option-button" onClick={moveAll}>
                  <strong>Move All</strong>
                  <div>Move selected inventory to another rack or work zone.</div>
                </button>

                <button
                  className="option-button"
                  disabled={selectedRows.length !== 1}
                  onClick={() => setTransferMode('partial')}
                >
                  <strong>Move Partial / Move by Bulk</strong>
                  <div>Split joints and footage from one selected line.</div>
                </button>

                <button
                  className="option-button"
                  onClick={() => setTransferOpen(false)}
                >
                  <strong>Cancel</strong>
                  <div>Leave inventory unchanged.</div>
                </button>
              </div>
            ) : (
              <div className="form-grid">
                <div className="form-row">
                  <label>Joints to transfer</label>
                  <input
                    value={moveJoints}
                    onChange={(event) => setMoveJoints(event.target.value)}
                    placeholder="50"
                  />
                </div>

                <div className="form-row">
                  <label>Feet to transfer</label>
                  <input
                    value={moveFootage}
                    onChange={(event) => setMoveFootage(event.target.value)}
                    placeholder="1550"
                  />
                </div>

                <div className="form-row full">
                  <label>Destination rack/location</label>
                  <select
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                  >
                    <optgroup label="Work zones">
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Racks">
                      {rackLayout.map((rack) => (
                        <option key={rack.id} value={rack.label}>
                          {rack.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="form-row full">
                  <label>Comment</label>
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Reason for move, ticket number, or yard note"
                  />
                </div>

                <button
                  className="button ghost"
                  onClick={() => setTransferMode('choice')}
                >
                  Back
                </button>

                <button className="button primary" onClick={movePartial}>
                  Finish
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {ticketOpen && (
        <div className="slide-over-backdrop">
          <section className="slide-over">
            <div className="section-title">
              <h2>
                {ticketOpen === 'receive'
                  ? 'Receiving Ticket'
                  : 'Shipping Ticket / BOL'}
              </h2>
              <button
                className="button ghost"
                onClick={() => setTicketOpen(null)}
              >
                Close
              </button>
            </div>

            <div className="metric-list">
              <div className="metric">
                <strong>
                  {ticketOpen === 'receive' ? 'RCV-DRAFT' : 'BOL-DRAFT'}
                </strong>
                <span>
                  {ticketOpen === 'receive'
                    ? 'Draft receiving ticket number'
                    : 'Draft shipping ticket / bill of lading number'}
                </span>
              </div>
            </div>

            <div className="form-grid ticket-form">
              <div className="form-row">
                <label>Carrier</label>
                <input placeholder="Carrier name" />
              </div>

              <div className="form-row">
                <label>PO Number</label>
                <input placeholder="PO or reference number" />
              </div>

              <div className="form-row">
                <label>Truck Number</label>
                <input placeholder="Truck / trailer number" />
              </div>

              <div className="form-row">
                <label>Customer</label>
                <select defaultValue="CP Energy">
                  <option>CP Energy</option>
                  <option>Acme Oil</option>
                  <option>New Customer</option>
                </select>
              </div>

              <div className="form-row">
                <label>
                  {ticketOpen === 'receive' ? 'Receive Into' : 'Ship From'}
                </label>
                <select
                  defaultValue={ticketOpen === 'receive' ? 'receiving' : 'shipping'}
                >
                  <optgroup label="Work zones">
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Racks">
                    {rackLayout.map((rack) => (
                      <option key={rack.id} value={rack.label}>
                        {rack.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="form-row">
                <label>TU#</label>
                <input placeholder="AFE" />
              </div>

              <div className="form-row">
                <label>Part Number</label>
                <input placeholder="Part number" />
              </div>

              <div className="form-row">
                <label>Size</label>
                <input placeholder='2 3/8"' />
              </div>

              <div className="form-row">
                <label>Grade</label>
                <input placeholder="J55" />
              </div>

              <div className="form-row">
                <label>Connection</label>
                <input placeholder="PH6, 8 Round EUE, NC50..." />
              </div>

              <div className="form-row">
                <label>Condition</label>
                <select defaultValue="New">
                  <option>New</option>
                  <option>Used</option>
                  <option>Repair</option>
                  <option>Rejected</option>
                  <option>Scrap</option>
                  <option>On Hold</option>
                </select>
              </div>

              <div className="form-row">
                <label>Bulk Joints</label>
                <input placeholder="500" />
              </div>

              <div className="form-row">
                <label>Bulk Footage</label>
                <input placeholder="15500" />
              </div>

              <div className="form-row full">
                <label>
                  {ticketOpen === 'receive'
                    ? 'Receiving Notes'
                    : 'Shipping / BOL Notes'}
                </label>
                <textarea placeholder="Carrier notes, visual condition, paperwork notes, driver instructions, etc." />
              </div>

              <button
                className="button ghost"
                onClick={() => setTicketOpen(null)}
              >
                Cancel
              </button>

              <button className="button primary" onClick={finishTicket}>
                {ticketOpen === 'receive'
                  ? 'Save Receiving Ticket'
                  : 'Generate Shipping Ticket / BOL'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
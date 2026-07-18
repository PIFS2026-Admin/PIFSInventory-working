export type TitanEquipmentAsset = {
  id: string;
  databaseId?: string;
  sourceKey?: string;
  assetTag: string;
  unitNumber: string;
  name: string;
  equipmentType: string;
  department: string;
  currentAssignment: string;
  isActive?: boolean;
};

function asset(
  id: string,
  assetTag: string,
  unitNumber: string,
  name: string,
  equipmentType: string,
  department: string,
  currentAssignment = "",
): TitanEquipmentAsset {
  return { id, assetTag, unitNumber, name, equipmentType, department, currentAssignment };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

export const titanEquipmentAssets: TitanEquipmentAsset[] = [
  asset("p20344", "P20344", "TXTRK#006", "TXTRK#006", "Sales Truck", "Sales", "John K"),
  asset("p46720", "P46720", "TXTRK#007", "TXTRK#007", "Sales Truck", "Sales", "Open"),
  asset("p08181", "P08181", "TXTRK#008", "TXTRK#008", "Sales Truck", "Sales", "Vince G"),
  asset("p05834", "P05834", "TXTRK#009", "TXTRK#009", "Sales Truck", "Sales", "Open"),
  asset("p38657", "P38657", "TXTRK#010", "TXTRK#010", "Sales Truck", "Sales", "Wade W"),
  asset("p21700", "P21700", "TXTRK#011", "TXTRK#011", "Sales Truck", "Sales", "Jesus D"),
  asset("p78237", "P78237", "TXTRK#220", "TXTRK#220", "DTI Truck", "DTI", "Chris R"),
  asset("p78161", "P78161", "TXTRK#221", "TXTRK#221", "DTI Truck", "DTI", "Brandon M"),
  asset("p95437", "P95437", "TXTRK#223", "TXTRK#223", "DTI Truck", "DTI", "Open"),
  asset("p43105", "P43105", "TXTRK#228", "TXTRK#228", "DTI Truck", "DTI", "Connor H"),
  asset("p47159", "P47159", "TXTRK#229", "TXTRK#229", "HB Truck", "Hardband", "Open"),
  asset("p44378", "P44378", "TXTRK#233", "TXTRK#233", "HB Truck", "Hardband", "Open"),
  asset("p37767", "P37767", "TXTRK#235", "TXTRK#235", "HB Truck", "Hardband", "Open"),
  asset("p39347", "P39347", "TXTRK#236", "TXTRK#236", "Sales Truck", "Sales", "Open"),
  asset("p95737", "P95737", "TXTRK#239", "TXTRK#239", "CDT Truck", "CDT", "Open"),
  asset("p42319", "P42319", "TXTRK#243", "TXTRK#243", "CDT Truck", "CDT", "Open"),
  asset("p42102", "P42102", "TXTRK#244", "TXTRK#244", "Sales Truck", "Sales", "Open"),
  asset("p49956", "P49956", "TXTRK#251", "TXTRK#251", "Sales Truck", "Sales", "Joseph C"),
  asset("p88273", "P88273", "TXTRK#252", "TXTRK#252", "Sales Truck", "Sales", "Open"),
  asset("p16166", "P16166", "TXTRK#253", "TXTRK#253", "Sales Truck", "Sales", "Open"),
  asset("p41727", "P41727", "TXTRK#254", "TXTRK#254", "Sales Truck", "Sales", "Grady W"),
  asset("p41982", "P41982", "TXTRK#255", "TXTRK#255", "Sales Truck", "Sales", "Ronnie G"),
  asset("p41807", "P41807", "TXTRK#256", "TXTRK#256", "Sales Truck", "Sales", "Open"),
  asset("p85218", "P85218", "TXTRK#260", "TXTRK#260", "DTI Truck", "DTI", "Pete C"),
  asset("p85512", "P85512", "TXTRK#261", "TXTRK#261", "DTI Truck", "DTI", "Robert R"),
  asset("p41313", "P41313", "TXTRK#263", "TXTRK#263", "CDT Truck", "CDT", "Open"),
  asset("p85703", "P85703", "TXTRK#264", "TXTRK#264", "Sales Truck", "Sales", "Open"),
  asset("p95892", "P95892", "TXTRK#265", "TXTRK#265", "Sales Truck", "Sales", "Open"),
  asset("p41307", "P41307", "TXTRK#268", "TXTRK#268", "CDT Truck", "CDT", "Open"),
  asset("p85839", "P85839", "TXTRK#270", "TXTRK#270", "DTI Truck", "DTI", "Cris S"),
  asset("p79100", "P79100", "TXTRK#271", "TXTRK#271", "CDT Truck", "CDT", "Open"),
  asset("p42891", "P42891", "TXTRK#280", "TXTRK#280", "DTI Truck", "DTI", "John R"),
  asset("p42936", "P42936", "TXTRK#281", "TXTRK#281", "DTI Truck", "DTI", "Phillip B"),
  asset("p43313", "P43313", "TXTRK#282", "TXTRK#282", "DTI Truck", "DTI", "Juan M"),
  asset("p41810", "P41810", "TXTRK#283", "TXTRK#283", "Tubing Truck", "Tubing", "Open"),
  asset("p43141", "P43141", "TXTRK#284", "TXTRK#284", "DTI Truck", "DTI", "Jonathan A"),
  asset("p42414", "P42414", "TXTRK#285", "TXTRK#285", "DTI Truck", "DTI", "Larry R"),
  asset("p47145", "P47145", "TXTRK#286", "TXTRK#286", "DTI Truck", "DTI", "Shannon S"),
  asset("txtrk287", "", "TXTRK#287", "TXTRK#287", "DTI Truck", "DTI", "Open"),
  asset("p94948", "P94948", "TXTRK#290", "TXTRK#290", "Hotshot Truck", "Hotshot", "Daniel D"),
  asset("p25090", "P25090", "TXTRK#291", "TXTRK#291", "Hotshot Truck", "Hotshot", "Ricky D"),
  asset("p95799", "P95799", "TXTRK#292", "TXTRK#292", "Hotshot Truck", "Hotshot", "Jose H"),
  asset("p29005", "P29005", "TXTRK#299", "TXTRK#299", "Shop Truck", "Shop", "Open"),
  asset("p37783", "P37783", "TXTRK#266", "TXTRK#266", "CDT Truck", "CDT", "Open"),
  asset("p39386", "P39386", "TXTRK#234", "TXTRK#234", "HB Truck", "Hardband", "Justin S"),
  asset("t02080", "T02080", "Blue EMI Unit", "Blue EMI Unit", "DTI Trailer", "DTI", "John R"),
  asset("t02081", "T02081", "Yellow EMI Unit", "Yellow EMI Unit", "DTI Trailer", "DTI", "Open"),
  asset("t02083", "T02083", "White EMI Unit", "White EMI Unit", "DTI Trailer", "DTI", "Juan M"),
  asset("t02084", "T02084", "Orange EMI Unit", "Orange EMI Unit", "DTI Trailer", "DTI", "Cris S"),
  asset("t02085", "T02085", "Green EMI Unit", "Green EMI Unit", "DTI Trailer", "DTI", "Pete C / Connor H"),
  asset("t02139", "T02139", "Red EMI Unit", "Red EMI Unit", "DTI Trailer", "DTI", "Robert R"),
  asset("t02243", "T02243", "Pink EMI Unit", "Pink EMI Unit", "DTI Trailer", "DTI", "Jonathan A"),
  asset("t08835", "T08835", "Black EMI Unit", "Black EMI Unit", "DTI Trailer", "DTI", "Larry R"),
  asset("t1621w", "T1621W", "TXREF#001", "TXREF#001", "DTI Trailer", "DTI"),
  asset("t32863", "T32863", "TXREF#002", "TXREF#002", "DTI Trailer", "DTI"),
  asset("t33284", "T33284", "TXREF#003", "TXREF#003", "DTI Trailer", "DTI"),
  asset("t34763", "T34763", "TXDRFTVAC", "TXDRFTVAC", "CDT Trailer", "CDT"),
  asset("t40959", "T40959", "TXSND#310", "TXSND#310", "DTI Trailer", "DTI"),
  asset("t45171", "T45171", "TXHB#305", "TXHB#305", "HB Trailer", "Hardband"),
  asset("t45176", "T45176", "TXHB#306", "TXHB#306", "HB Trailer", "Hardband"),
  asset("t40137", "T40137", "TXPW002", "TXPW002", "CDT Trailer", "CDT"),
  asset("t35767", "T35767", "TXPW003", "TXPW003", "DTI Trailer", "DTI"),
  asset("t32998", "T32998", "TXPW001", "TXPW001", "DTI Trailer", "DTI"),
  asset("t43390", "T43390", "TXHS#001", "TXHS#001", "Hotshot Trailer", "Hotshot"),
  asset("t43391", "T43391", "TXHS#002", "TXHS#002", "Hotshot Trailer", "Hotshot"),
  asset("t19274", "T19274", "TXCAS#320", "TXCAS#320", "CDT Trailer", "CDT"),
  asset("c04749", "C04749", "TXCAR#105", "TXCAR#105", "Buick", "Operations"),
  asset("06419", "06419", "TXCAR#112", "TXCAR#112", "Buick", "Operations"),
  asset("c16767", "C16767", "TXCAR#117", "TXCAR#117", "Buick", "Operations"),
  asset("c19999", "C19999", "TXCAR#114", "TXCAR#114", "Buick", "Operations"),
  asset("c20963", "C20963", "TXCAR#111", "TXCAR#111", "Buick", "Operations"),
  asset("c25841", "C25841", "TXCAR#113", "TXCAR#113", "Buick", "Operations"),
  asset("c29035", "C29035", "TXCAR#115", "TXCAR#115", "Buick", "Operations"),
  asset("c31073", "C31073", "TXCAR#101", "TXCAR#101", "Buick", "Operations"),
  asset("c31954", "C31954", "TXCAR#107", "TXCAR#107", "Buick", "Operations"),
  asset("c32957", "C32957", "TXCAR#108", "TXCAR#108", "Buick", "Operations"),
  asset("c32029", "C32029", "TX Safety", "TX Safety", "Buick", "Safety"),
  asset("c33370", "C33370", "TXCAR#???", "TXCAR#???", "Buick", "Operations"),
  asset("c33752", "C33752", "TXCAR#110", "TXCAR#110", "Buick", "Operations"),
  asset("c40290", "C40290", "TXCAR#119", "TXCAR#119", "Buick", "Operations"),
  asset("c42320", "C42320", "TXCAR#102", "TXCAR#102", "Buick", "Operations"),
  asset("c44361", "C44361", "TXCAR#106", "TXCAR#106", "Buick", "Operations"),
  asset("c48725", "C48725", "TXCAR#116", "TXCAR#116", "Buick", "Operations"),
  asset("c55439", "C55439", "TXCAR#109", "TXCAR#109", "Buick", "Operations"),
  asset("c67557", "C67557", "TXCAR#???", "TXCAR#???", "Buick", "Operations"),
  asset("c81058", "C81058", "TXCAR#118", "TXCAR#118", "Buick", "Operations"),
  asset("c96637", "C96637", "TXCAR#120", "TXCAR#120", "Buick", "Operations"),
  asset("l00780", "L00780", "L00780", "John Deere L00780", "Loader", "Yard"),
  asset("l00781", "L00781", "L00781", "John Deere L00781", "Loader", "Yard"),
  asset("l00782", "L00782", "L00782", "John Deere L00782", "Loader", "Yard"),
  asset("l00783", "L00783", "L00783", "John Deere L00783", "Loader", "Yard"),
  asset("l00786", "L00786", "L00786", "John Deere L00786", "Loader", "Yard"),
  asset("l00787", "L00787", "L00787", "John Deere L00787", "Loader", "Yard"),
  asset("l00788", "L00788", "L00788", "John Deere L00788", "Loader", "Yard"),
  asset("l00789", "L00789", "L00789", "John Deere L00789", "Loader", "Yard"),
  asset("k22410", "K22410", "K22410", "KOM WA200", "Loader", "Yard"),
  asset("k23703", "K23703", "K23703", "KOM WA200", "Loader", "Yard"),
  asset("tx27297", "TX27297", "TX27297", "Volvo L90F", "Loader", "Yard"),
  asset("tx68626", "TX68626", "TX68626", "Volvo L90F", "Loader", "Yard"),
  asset("txfl601", "TXFL601", "TXFL601", "Volvo 110F", "Loader", "Yard"),
];

export function equipmentAssetLabel(asset: TitanEquipmentAsset) {
  const unit = asset.unitNumber || asset.name;
  const tag = asset.assetTag && asset.assetTag !== unit ? ` / ${asset.assetTag}` : "";
  const assignment = asset.currentAssignment ? ` / ${asset.currentAssignment}` : "";
  return `${unit}${tag} / ${asset.equipmentType}${assignment}`;
}

export function mapEquipmentAssetRow(row: Record<string, unknown>): TitanEquipmentAsset {
  const sourceKey = text(row.source_key ?? row.sourceKey);
  const databaseId = text(row.id);
  const equipmentNumber = text(row.equipment_number ?? row.equipmentNumber ?? row.asset_tag ?? row.assetTag);
  const equipmentName = text(row.equipment_name ?? row.equipmentName ?? row.name) || equipmentNumber;
  const equipmentType = text(row.equipment_type ?? row.equipmentType);
  const department = text(row.department);

  return {
    id: sourceKey || databaseId || equipmentNumber || equipmentName,
    databaseId,
    sourceKey,
    assetTag: equipmentNumber,
    unitNumber: equipmentNumber,
    name: equipmentName,
    equipmentType,
    department,
    currentAssignment: text(row.current_assignment ?? row.currentAssignment),
    isActive: row.is_active !== false && row.isActive !== false,
  };
}

export function equipmentAssetSourceKey(asset: TitanEquipmentAsset) {
  return asset.sourceKey || asset.id;
}

export function mergeEquipmentAssetRows(
  rows: Record<string, unknown>[] = [],
  options: { includeInactive?: boolean } = {},
) {
  const merged = new Map<string, TitanEquipmentAsset>();

  titanEquipmentAssets.forEach((asset) => {
    const sourceKey = equipmentAssetSourceKey(asset);
    merged.set(sourceKey, {
      ...asset,
      id: sourceKey,
      sourceKey,
      isActive: asset.isActive !== false,
    });
  });

  rows.forEach((row) => {
    const mapped = mapEquipmentAssetRow(row);
    const sourceKey = mapped.sourceKey;
    const mergeKey = sourceKey || mapped.databaseId || mapped.id;
    const base = sourceKey ? merged.get(sourceKey) : null;

    merged.set(mergeKey, {
      ...(base || {}),
      ...mapped,
      id: base?.id || mapped.id,
      sourceKey: sourceKey || base?.sourceKey,
      databaseId: mapped.databaseId,
    });
  });

  const assets = Array.from(merged.values()).sort((left, right) => {
    const leftText = `${left.department} ${left.equipmentType} ${left.name} ${left.assetTag}`;
    const rightText = `${right.department} ${right.equipmentType} ${right.name} ${right.assetTag}`;
    return leftText.localeCompare(rightText);
  });

  return options.includeInactive ? assets : assets.filter((asset) => asset.isActive !== false);
}

export function equipmentAssetSearchText(asset: TitanEquipmentAsset) {
  return [
    asset.assetTag,
    asset.unitNumber,
    asset.name,
    asset.equipmentType,
    asset.department,
    asset.currentAssignment,
    asset.sourceKey,
    equipmentAssetLabel(asset),
  ]
    .join(" ")
    .toLowerCase();
}

/** M3-P: VERSIONED, PURE production-shape session contract. NO STORAGE I/O.
 * V1 in codec.mjs remains development-only and is NOT silently migrated.
 * A monotonic watermark preserves historical i1-occurrence-N identity nonreuse.
 */
// Public V2 module uses the same strict limits as V1 without bundling
// the development-only V1 codec. Tests pin equality across both contracts.
const MAX_SESSION_ENTRIES=32;
const MAX_SERIALIZED_CODE_UNITS=16384;
const MAX_SERIALIZED_UTF8_BYTES=16384;
const MAX_CATALOGUE_REVISION_CODE_UNITS=128;
const MAX_ID_CODE_UNITS=128;
const MAX_LABEL_CODE_UNITS=128;

export const PRODUCTION_SESSION_SCHEMA_VERSION = 2;
export const MAX_ISSUED_OCCURRENCE_NUMBER = Number.MAX_SAFE_INTEGER - MAX_SESSION_ENTRIES;
const exact = (x, keys) => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null) &&
  Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x,k));
const text = (x, max, spaces=false) => typeof x === 'string' && x.length > 0 &&
  x.length <= max && x.trim() === x && !/[\u0000-\u001f\u007f]/u.test(x) &&
  (spaces || !/\s/u.test(x));
export function occurrenceNumber(id) {
  if (!text(id,MAX_ID_CODE_UNITS) || !/^i1-occurrence-[1-9][0-9]*$/u.test(id)) return null;
  const digits=id.slice('i1-occurrence-'.length);
  const n=Number(digits);
  return Number.isSafeInteger(n) && n>0 && n<=MAX_ISSUED_OCCURRENCE_NUMBER &&
    String(n)===digits ? n : null;
}
function bounded(serialized) {
  return serialized.length<=MAX_SERIALIZED_CODE_UNITS &&
    new TextEncoder().encode(serialized).length<=MAX_SERIALIZED_UTF8_BYTES;
}
export function validateProductionSessionV2(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {kind:'invalid',reason:'not-record'};
  if (!Object.hasOwn(value,'sessionSchemaVersion') ||
    !Number.isSafeInteger(value.sessionSchemaVersion) || value.sessionSchemaVersion<0)
    return {kind:'invalid',reason:'bad-schema-field'};
  if(value.sessionSchemaVersion!==PRODUCTION_SESSION_SCHEMA_VERSION)
    return {kind:'unsupported-schema',schemaVersion:value.sessionSchemaVersion};
  if(!exact(value,['sessionSchemaVersion','catalogueRevision',
      'lastIssuedOccurrenceNumber','occurrences']))
    return {kind:'invalid',reason:'unexpected-record-fields'};
  const watermark=value.lastIssuedOccurrenceNumber;
  if(!Number.isSafeInteger(watermark) || watermark<1 || watermark>MAX_ISSUED_OCCURRENCE_NUMBER)
    return {kind:'invalid',reason:'invalid-allocation-watermark'};
  if(!text(value.catalogueRevision,MAX_CATALOGUE_REVISION_CODE_UNITS))
    return {kind:'invalid',reason:'invalid-catalogue-revision'};
  if(!Array.isArray(value.occurrences) || value.occurrences.length<1 ||
    value.occurrences.length>MAX_SESSION_ENTRIES)
    return {kind:'invalid',reason:'invalid-occurrence-count'};
  const seen=new Set(), occurrences=[];
  for(const e of value.occurrences) {
    if(!exact(e,['occurrenceId','label','selectedShapeId']))
      return {kind:'invalid',reason:'invalid-occurrence-fields'};
    const number=occurrenceNumber(e.occurrenceId);
    if(number===null || number>watermark || seen.has(number))
      return {kind:'invalid',reason:'invalid-or-reused-occurrence-id'};
    if(!text(e.label,MAX_LABEL_CODE_UNITS,true) ||
      !text(e.selectedShapeId,MAX_ID_CODE_UNITS) ||
      !/^vg\.shape\.[0-9]{4,}$/u.test(e.selectedShapeId))
      return {kind:'invalid',reason:'invalid-label-or-shape'};
    seen.add(number);
    occurrences.push({occurrenceId:e.occurrenceId,label:e.label,
      selectedShapeId:e.selectedShapeId});
  }
  return {kind:'ok',session:{sessionSchemaVersion:PRODUCTION_SESSION_SCHEMA_VERSION,
    catalogueRevision:value.catalogueRevision,
    lastIssuedOccurrenceNumber:watermark, occurrences}};
}
export function encodeProductionSessionV2(value) {
  const checked=validateProductionSessionV2(value);
  if(checked.kind!=='ok') return checked;
  const json=JSON.stringify(checked.session);
  if(!bounded(json)) return {kind:'invalid',reason:'serialized-size'};
  return {kind:'ok',text:json};
}
export function decodeProductionSessionV2(raw) {
  if(typeof raw!=='string') return {kind:'corrupt',reason:'not-text'};
  if(!bounded(raw)) return {kind:'corrupt',reason:'serialized-size'};
  let parsed;
  try {parsed=JSON.parse(raw);} catch {return {kind:'corrupt',reason:'malformed-json'};}
  const checked=validateProductionSessionV2(parsed);
  return checked.kind==='invalid' ? {kind:'corrupt',reason:checked.reason} : checked;
}
/** No saving; converts an accepted controller snapshot to a validated record. */
export function captureProductionSessionV2(controllerSnapshot,catalogueRevision) {
  if(!exact(controllerSnapshot,['arrangement','lastIssuedOccurrenceNumber']))
    return {kind:'invalid',reason:'invalid-controller-snapshot'};
  if(!Array.isArray(controllerSnapshot.arrangement))
    return {kind:'invalid',reason:'invalid-controller-arrangement'};
  const occurrences=controllerSnapshot.arrangement.map(e=>({
    occurrenceId:e?.id,label:e?.label,selectedShapeId:e?.shapeId,
  }));
  return validateProductionSessionV2({sessionSchemaVersion:PRODUCTION_SESSION_SCHEMA_VERSION,
    catalogueRevision,lastIssuedOccurrenceNumber:controllerSnapshot.lastIssuedOccurrenceNumber,
    occurrences});
}

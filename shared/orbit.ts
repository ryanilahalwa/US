export function getRelationshipElapsed(startDate: Date | string | number, now = Date.now()) {
  const start = new Date(startDate).getTime();
  const elapsedMilliseconds = Number.isFinite(start) ? Math.max(0, now - start) : 0;
  return {
    elapsedMilliseconds,
    days: Math.floor(elapsedMilliseconds / 86_400_000),
    hours: Math.floor((elapsedMilliseconds % 86_400_000) / 3_600_000),
    minutes: Math.floor((elapsedMilliseconds % 3_600_000) / 60_000),
    seconds: Math.floor((elapsedMilliseconds % 60_000) / 1000),
  };
}

export function canViewWellnessEntry(entryOwnerId: number, shareWithPartner: boolean, viewerId: number) {
  return entryOwnerId === viewerId || shareWithPartner;
}

export function isPairScopedRecord(memberRelationshipId: number, recordRelationshipId: number) {
  return memberRelationshipId === recordRelationshipId;
}

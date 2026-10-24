export function sharedCctpOpenTarget(message, currentUserId) {
  if (!message || message.pending) return { type: "none" };

  const cctpId = message.payload?.cctpId;
  if (message.senderId === currentUserId && cctpId) {
    return { type: "owned-preview", cctpId };
  }

  return { type: "shared-preview" };
}

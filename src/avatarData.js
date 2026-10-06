const SKIN = ["#FBD9BE", "#EDB98D", "#C98A5E", "#8D5A3C", "#5A3825", "#9BE564", "#7DE3F4", "#F7D154"];
const HAIR = ["#14111F", "#6B4429", "#F2C94C", "#FF4D8D", "#7C5CFF", "#22D3EE", "#F4F4F8", "#FF7A35"];
const OUTFIT = ["#FF4D8D", "#7C5CFF", "#22D3EE", "#F6C445", "#2E9E8F", "#FF7A35", "#1F2937", "#EF4444", "#A3E635", "#3B82F6"];
const BG = ["#8B7CFF", "#4FD1E8", "#FFB454", "#FF7A9C", "#5EDC9A", "#FFD84D", "#C084FC", "#6AA8FF"];
const SIZES = [SKIN.length, 8, HAIR.length, OUTFIT.length, BG.length, 3, 3];
const STORAGE_KEY = "selah.avatar.";

export { BG, HAIR, OUTFIT, SKIN, SIZES };

export function normalizeAvatar(code) {
  return typeof code === "string" &&
    /^\d{7}$/.test(code) &&
    [...code].every((digit, index) => Number(digit) < SIZES[index])
    ? code
    : null;
}

export function avatarBg(code) {
  return BG[Number(normalizeAvatar(code)?.[4] ?? 0)];
}

export function randomAvatar() {
  return [...crypto.getRandomValues(new Uint8Array(7))]
    .map((byte, index) => byte % SIZES[index])
    .join("");
}

export function avatarFromIdentity(identity = "") {
  let hash = 2166136261;
  for (const character of identity) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return SIZES.map((size) => {
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
    return Math.abs(hash) % size;
  }).join("");
}

export function getSavedAvatar(roomCode) {
  return normalizeAvatar(localStorage.getItem(`${STORAGE_KEY}${roomCode}`));
}

export function saveAvatar(roomCode, code) {
  const validCode = normalizeAvatar(code);
  if (!validCode) throw new Error("Choose a valid avatar before joining.");
  localStorage.setItem(`${STORAGE_KEY}${roomCode}`, validCode);
}
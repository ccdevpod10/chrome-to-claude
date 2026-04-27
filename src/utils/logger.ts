const TAG = "[ai-assist]";
export const log = {
  info: (...a: unknown[]) => console.log(TAG, ...a),
  warn: (...a: unknown[]) => console.warn(TAG, ...a),
  error: (...a: unknown[]) => console.error(TAG, ...a),
};

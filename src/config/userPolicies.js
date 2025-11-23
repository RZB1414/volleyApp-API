const GB = 1024 * 1024 * 1024;

export const userPolicies = {
  paid: {
    name: 'paid',
    maxStorageBytes: 10 * GB,
    maxUploadSizeBytes: 10 * GB,
    uploadBandwidthMbps: 100,
    downloadBandwidthMbps: 200
  },
  free: {
    name: 'free',
    maxStorageBytes: 2 * GB,
    maxUploadSizeBytes: 2 * GB,
    uploadBandwidthMbps: 10,
    downloadBandwidthMbps: 20
  }
};

export function getUserPolicy(type = 'free') {
  return userPolicies[type] ?? userPolicies.free;
}

import {CLOUDINARY} from '../constants';

function _buildEndpoint(resourceType = 'image') {
  return `https://api.cloudinary.com/v1_1/${CLOUDINARY.CLOUD_NAME}/${resourceType}/upload`;
}

function _guessMimeType(filePath, resourceType) {
  const lower = (filePath || '').toLowerCase();
  if (resourceType === 'video') {
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.webm')) return 'video/webm';
    return 'video/mp4';
  }
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function _upload(filePath, resourceType = 'image') {
  if (!filePath) {
    return {ok: false, error: 'Đường dẫn file rỗng.'};
  }

  const endpoint = _buildEndpoint(resourceType);
  const formData = new FormData();
  formData.append('upload_preset', CLOUDINARY.UPLOAD_PRESET);

  const hasUriScheme =
    filePath.startsWith('file://') ||
    filePath.startsWith('content://') ||
    filePath.startsWith('ph://') ||
    filePath.startsWith('assets-library://');
  const safeUri = hasUriScheme ? filePath : `file://${filePath}`;
  formData.append('file', {
    uri: safeUri,
    type: _guessMimeType(filePath, resourceType),
    name: `${resourceType}_${Date.now()}`,
  });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
    const json = await res.json();

    if (!res.ok || json?.error) {
      return {
        ok: false,
        error: json?.error?.message || 'Upload Cloudinary thất bại.',
      };
    }

    return {
      ok: true,
      url: json.secure_url,
      publicId: json.public_id,
      resourceType: json.resource_type,
      format: json.format,
      width: json.width,
      height: json.height,
      duration: json.duration,
    };
  } catch (e) {
    return {ok: false, error: e?.message || 'Lỗi mạng khi upload Cloudinary.'};
  }
}

export async function uploadImageToCloudinary(filePath) {
  return _upload(filePath, 'image');
}

export async function uploadVideoToCloudinary(filePath) {
  return _upload(filePath, 'video');
}


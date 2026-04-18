import {CLOUDINARY} from '../constants';

function buildUploadUrl(resourceType) {
  return `https://api.cloudinary.com/v1_1/${CLOUDINARY.CLOUD_NAME}/${resourceType}/upload`;
}

/**
 * Upload file lên Cloudinary (unsigned preset).
 * @param {{ uri: string, type?: string, fileName?: string }} file — uri từ image-picker / DocumentPicker
 * @param {'video'|'image'} resourceType
 * @returns {Promise<{ok: boolean, url?: string, publicId?: string, error?: string}>}
 */
export async function uploadToCloudinary(file, resourceType) {
  const uri = file?.uri;
  if (!uri || typeof uri !== 'string') {
    return {ok: false, error: 'Thiếu đường dẫn file.'};
  }

  const name =
    file.fileName ||
    (resourceType === 'video' ? 'upload.mp4' : 'upload.jpg');
  const mime =
    file.type ||
    (resourceType === 'video' ? 'video/mp4' : 'image/jpeg');

  const formData = new FormData();
  formData.append('file', {uri, type: mime, name});
  formData.append('upload_preset', CLOUDINARY.UPLOAD_PRESET);

  try {
    const res = await fetch(buildUploadUrl(resourceType), {
      method: 'POST',
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error?.message || `Upload thất bại (${res.status}).`,
      };
    }
    const url = json?.secure_url || json?.url;
    if (!url) {
      return {ok: false, error: 'Cloudinary không trả về URL.'};
    }
    return {
      ok: true,
      url: String(url),
      publicId: json?.public_id != null ? String(json.public_id) : undefined,
    };
  } catch (e) {
    return {ok: false, error: e?.message || 'Lỗi mạng khi upload Cloudinary.'};
  }
}

export async function uploadVideoToCloudinary(file) {
  return uploadToCloudinary(file, 'video');
}

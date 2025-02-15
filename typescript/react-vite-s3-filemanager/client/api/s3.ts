import axios from "axios";

const API_BASE = "http://localhost:5000/api"; // Adjust if backend URL changes

export interface S3File {
  key: string;
  name: string;
  size: number;
  lastModified: string;
}

/** Fetch list of files */
export const fetchFiles = async (): Promise<S3File[]> => {
  const { data } = await axios.get<S3File[]>(`${API_BASE}/files`);
  return data;
};

/** Get presigned URL and upload a file */
export const uploadFile = async (file: File) => {
  const { data } = await axios.get<{ uploadUrl: string }>(`${API_BASE}/upload`, {
    params: { filename: file.name },
  });

  await axios.put(data.uploadUrl, file, {
    headers: { "Content-Type": file.type },
  });

  return { success: true };
};

/** Get presigned URL for downloading */
export const getDownloadUrl = async (fileKey: string) => {
  const { data } = await axios.get<{ downloadUrl: string }>(`${API_BASE}/download`, {
    params: { key: fileKey },
  });

  return data.downloadUrl;
};

/** Delete a file */
export const deleteFile = async (fileKey: string) => {
  await axios.delete(`${API_BASE}/delete`, { data: { key: fileKey } });
};

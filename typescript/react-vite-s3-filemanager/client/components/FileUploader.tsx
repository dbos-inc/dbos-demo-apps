import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadFile } from "../api/s3";
import { useState } from "react";

const FileUploader = () => {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: uploadFile,
    onSuccess: () => queryClient.invalidateQueries(["files"]),
  });

  const handleUpload = () => {
    if (file) uploadMutation.mutate(file);
  };

  return (
    <div>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <button onClick={handleUpload} disabled={!file || uploadMutation.isLoading}>
        Upload
      </button>
    </div>
  );
};

export default FileUploader;

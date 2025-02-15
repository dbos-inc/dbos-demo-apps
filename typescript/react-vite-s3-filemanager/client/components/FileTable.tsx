import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ColumnDef, useReactTable, getCoreRowModel } from "@tanstack/react-table";
import { fetchFiles, getDownloadUrl, deleteFile, S3File } from "../api/s3";

const FileTable = () => {
  const queryClient = useQueryClient();
  const { data: files = [], isLoading } = useQuery({
    queryKey: ["files"],
    queryFn: fetchFiles,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFile,
    onSuccess: () => queryClient.invalidateQueries(["files"]),
  });

  const handleDownload = async (fileKey: string) => {
    const url = await getDownloadUrl(fileKey);
    window.open(url, "_blank");
  };

  const columns: ColumnDef<S3File>[] = [
    { accessorKey: "name", header: "File Name" },
    { accessorKey: "size", header: "Size", cell: (info) => `${info.getValue()} KB` },
    { accessorKey: "lastModified", header: "Last Modified" },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div>
          <button onClick={() => handleDownload(row.original.key)}>Download</button>
          <button onClick={() => deleteMutation.mutate(row.original.key)}>Delete</button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: files,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (isLoading) return <p>Loading files...</p>;

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th key={header.id}>{header.column.columnDef.header as string}</th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{cell.renderCell()}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default FileTable;

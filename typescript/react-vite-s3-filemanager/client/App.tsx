import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FileTable from "./components/FileTable";
import FileUploader from "./components/FileUploader";

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <h1>S3 File Manager</h1>
      <FileUploader />
      <FileTable />
    </QueryClientProvider>
  );
};

export default App;

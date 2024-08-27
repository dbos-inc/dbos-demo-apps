import {
  HandlerContext,
  TransactionContext,
  Transaction,
  WorkflowContext,
  CommunicatorContext,
  GetApi,
  ArgSource,
  ArgSources,
  parseConfigFile,
  DBOSConfig,
  Workflow,
  Communicator,
} from "@dbos-inc/dbos-sdk";
import { PoolClient, Pool } from "pg";
import {
  PGVectorStore,
  PGVectorStoreArgs,
  DistanceStrategy,
} from "@langchain/community/vectorstores/pgvector";
import { Document } from "@langchain/core/documents";
import { formatDocumentsAsString } from "langchain/util/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TogetherAIEmbeddings } from "@langchain/community/embeddings/togetherai";
import { ChatTogetherAI } from "@langchain/community/chat_models/togetherai";
import { Embeddings } from "@langchain/core/embeddings";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Callbacks } from "@langchain/core/callbacks/manager";
import {
  RunnableSequence,
  RunnablePassthrough,
} from "@langchain/core/runnables";
import { PromptTemplate } from "@langchain/core/prompts";

const dbosConfig: DBOSConfig = parseConfigFile()[0];

export class Empyrical {
  @GetApi("/summarize/:paperID")
  static async summarizeHandler(
    ctxt: HandlerContext,
    @ArgSource(ArgSources.URL) paperID: string
  ) {
    const handler = await ctxt.invoke(Empyrical).summarizeDoc(paperID);
    ctxt.logger.info(
      "Started summarize workflow with UUID: " + handler.getWorkflowUUID()
    );
    return await handler.getResult();
  }

  @Workflow()
  static async summarizeDoc(ctxt: WorkflowContext, paperID: string) {
    const embeddings = loadEmbeddingsModel();

    let resolveWithDocuments: (value: Document[]) => void;
    const documentPromise = new Promise<Document[]>((resolve) => {
      resolveWithDocuments = resolve;
    });

    const retrieverInfo = await loadRetriever({
      paperID,
      callbacks: [
        {
          handleRetrieverEnd(documents) {
            // Extract retrieved source documents so that they can be displayed as sources
            // on the frontend.
            resolveWithDocuments(documents);
          },
        },
      ],
    });
    const retriever = retrieverInfo.retriever;

    const model = new ChatTogetherAI({
      modelName: "mistralai/Mixtral-8x7B-Instruct-v0.1",
      temperature: 0,
    });

    const prompt =
      PromptTemplate.fromTemplate(`You are an accomplished computer scientists would wants to help new doctoral students understand queuing theory applied to systems research. Answer the question based only on the following context:
{context}

Question: {question}`);

    const chain = RunnableSequence.from([
      {
        context: retriever.pipe(formatDocumentsAsString),
        question: new RunnablePassthrough(),
      },
      prompt,
      model,
      new StringOutputParser(),
    ]);

    const result = await chain.invoke("What is the summary of the paper?");

    console.log(result);
    return result;
  }

  @GetApi("/upload")
  static async uploadPaperHandler(
    ctxt: HandlerContext,
    @ArgSource(ArgSources.QUERY) paperURL: string,
    @ArgSource(ArgSources.QUERY) paperName: string
  ) {
    const handler = await ctxt
      .invoke(Empyrical)
      .uploadPaper(paperURL, paperName);
    ctxt.logger.info(
      "Started upload workflow with UUID: " + handler.getWorkflowUUID()
    );
    return await handler.getResult();
  }

  @Workflow()
  static async uploadPaper(
    ctxt: WorkflowContext,
    paperURL: string,
    paperName: string
  ) {
    // Decode paperURL from base64
    const url = Buffer.from(paperURL, "base64").toString("utf-8");
    ctxt.logger.info("Uploading file from URL: " + url);

    await ctxt.invoke(Empyrical).recordPaperMetadata(paperURL, paperName);

    // Record doc metadata in postgres
    let paperID;
    try {
      paperID = await ctxt
        .invoke(Empyrical)
        .recordPaperMetadata(paperName, paperURL);
    } catch (error) {
      ctxt.logger.error(error);
      return "Failed to store paper metadata";
    }

    // Fetch paper
    let buffer;
    try {
      buffer = await ctxt.invoke(Empyrical).fetchPaper(url);
    } catch (error) {
      ctxt.logger.error(error);
      return "Failed to fetch paper";
    }
    const loader = new PDFLoader(buffer);
    const rawPages = await loader.load();
    ctxt.logger.info(`Loaded ${rawPages.length} pages`);

    // Retrieve embeddings for the paper. This is an expensive operation so we do it in a Communicator (at least once)
    try {
      ctxt.logger.info("Inserting document in PG");
      await ctxt.invoke(Empyrical).storePaperEmbeddings(rawPages, paperID);
    } catch (error) {
      ctxt.logger.error(error);
      return { error: "Failed to ingest your data" };
    }
    return Promise.resolve({ text: "Successfully embedded pdf" });
  }

  @Transaction()
  static async recordPaperMetadata(
    ctxt: TransactionContext<PoolClient>,
    paperName: string,
    paperURL: string
  ): Promise<string> {
    const res = await ctxt.client.query(
      "INSERT INTO papers_metadata(name, url) VALUES($1, $2) RETURNING id",
      [paperName, paperURL]
    );
    return res.rows[0].id;
  }

  @Communicator()
  static async fetchPaper(
    ctxt: CommunicatorContext,
    paperURL: string
  ): Promise<Blob> {
    const response = await fetch(paperURL);
    return await response.blob();
  }

  @Transaction()
  static async storePaperEmbeddings(
    ctxt: TransactionContext<PoolClient>,
    rawPages: Document[],
    paperID: string
  ) {
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 3000,
      chunkOverlap: 200,
    });
    const splitPages = await textSplitter.splitDocuments(rawPages);
    for (let i = 0; i < splitPages.length; i++) {
      splitPages[i].metadata.docstore_document_id = paperID;
    }
    ctxt.logger.info(
      `Split ${splitPages.length} pages in chunks of ${textSplitter.chunkSize} characters`
    );

    const vectorStore = await loadVectorStore();
    ctxt.logger.info("Initialized vector store");

    return await vectorStore.addDocuments(splitPages);
  }
}

// UTILITIES

function loadEmbeddingsModel() {
  return new TogetherAIEmbeddings({
    apiKey: process.env.TOGETHER_AI_API_KEY,
    modelName: "togethercomputer/m2-bert-80M-8k-retrieval",
    batchSize: 2048,
  });
}

// Setup postgres as a retriever
async function loadRetriever({
  paperID,
  callbacks,
}: {
  paperID: string;
  callbacks?: Callbacks;
}) {
  const vectorStore = await loadVectorStore();
  // Use metadata filtering to separate documents.
  const filter = {
    preFilter: {
      docstore_document_id: {
        $eq: paperID,
      },
    },
  };
  const retriever = vectorStore.asRetriever({
    filter,
    callbacks,
  });
  return {
    retriever,
  };
}

async function loadVectorStore() {
  // Load BERT embeddings
  const embeddings: Embeddings = loadEmbeddingsModel();

  // FIXME: ideally we would be using our context client
  const vectorStoreConfig: PGVectorStoreArgs = {
    postgresConnectionOptions: dbosConfig.poolConfig,
    tableName: "paper_tokens",
    columns: {
      idColumnName: "id",
      vectorColumnName: "vector",
      contentColumnName: "content",
      metadataColumnName: "metadata",
    },
    distanceStrategy: "cosine" as DistanceStrategy,
  };

  return await PGVectorStore.initialize(embeddings, vectorStoreConfig);
}

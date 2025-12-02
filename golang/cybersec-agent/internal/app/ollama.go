package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

const defaultOllamaURL = "http://localhost:11434"
const defaultModel = "llama3.1:8b-instruct-q4_K_M"

type ollamaRequest struct {
	Model    string         `json:"model"`
	Prompt   string         `json:"prompt,omitempty"`
	Stream   bool           `json:"stream"`
	Messages []message      `json:"messages,omitempty"`
	Options  map[string]any `json:"options,omitempty"`
}

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ollamaResponse struct {
	Response string `json:"response"`
	Done     bool   `json:"done"`
}

// OllamaClient handles communication with Ollama API
type OllamaClient struct {
	baseURL string
	model   string
}

// NewOllamaClient creates a new Ollama client
func NewOllamaClient() *OllamaClient {
	url := os.Getenv("OLLAMA_URL")
	if url == "" {
		url = defaultOllamaURL
	}
	return &OllamaClient{
		baseURL: url,
		model:   defaultModel,
	}
}

// DetectVulnerability analyzes a security scan report to determine if it contains vulnerabilities
func (c *OllamaClient) DetectVulnerability(report string) (bool, error) {
	prompt := fmt.Sprintf(`Analyze the following security scan report and determine if it contains any vulnerabilities.
Respond with only "YES" if vulnerabilities are found, or "NO" if no vulnerabilities are detected.

Report:
%s`, "prout")
	// %s`, report)

	reqBody := ollamaRequest{
		Model:  c.model,
		Prompt: prompt,
		Stream: false,
		Options: map[string]any{
			"num_ctx": 32768, // 32k context window for llama3.1
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return false, fmt.Errorf("failed to marshal request: %w", err)
	}

	fmt.Println("Sending request to Ollama")

	resp, err := http.Post(
		fmt.Sprintf("%s/api/generate", c.baseURL),
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		return false, fmt.Errorf("failed to call Ollama API: %w", err)
	}
	defer resp.Body.Close()

	fmt.Printf("Response from Ollama: %s\n", resp.Body)

	var ollamaResp ollamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return false, fmt.Errorf("failed to decode response: %w", err)
	}

	response := ollamaResp.Response
	return response == "YES" || containsVulnerability(response), nil
}

// GenerateIssueContent generates GitHub issue content based on a vulnerability report
func (c *OllamaClient) GenerateIssueContent(repoName, report string) (string, error) {
	prompt := fmt.Sprintf(`Generate a professional GitHub issue body for a security vulnerability found in the repository %s.
The issue should:
- Have a clear title in the first line
- Explain the vulnerability clearly
- Provide actionable recommendations
- Be formatted in Markdown

Security scan report:
%s`, "prout")
	// %s`, repoName, report)

	reqBody := ollamaRequest{
		Model:  c.model,
		Prompt: prompt,
		Stream: false,
		Options: map[string]any{
			"num_ctx": 32768, // 32k context window for llama3.1
		},
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	resp, err := http.Post(
		fmt.Sprintf("%s/api/generate", c.baseURL),
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		return "", fmt.Errorf("failed to call Ollama API: %w", err)
	}
	defer resp.Body.Close()

	var ollamaResp ollamaResponse
	if err := json.NewDecoder(resp.Body).Decode(&ollamaResp); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	return ollamaResp.Response, nil
}

func containsVulnerability(response string) bool {
	// Check if response contains keywords indicating vulnerabilities
	keywords := []string{"vulnerability", "vulnerabilities", "security issue", "CVE", "exploit"}
	responseLower := bytes.ToLower([]byte(response))
	for _, keyword := range keywords {
		if bytes.Contains(responseLower, []byte(keyword)) {
			return true
		}
	}
	return false
}

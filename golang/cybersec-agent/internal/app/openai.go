package app

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/shared"
)

const defaultOpenAIModel = "gpt-4o-mini"

// OpenAIClient handles communication with OpenAI API
type OpenAIClient struct {
	client openai.Client
	model  string
}

// NewOpenAIClient creates a new OpenAI client
func NewOpenAIClient() *OpenAIClient {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		panic("OPENAI_API_KEY environment variable is required")
	}

	model := os.Getenv("OPENAI_MODEL")
	if model == "" {
		model = defaultOpenAIModel
	}

	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
	}

	// Support custom OpenAI URL (e.g., for OpenAI-compatible APIs)
	if url := os.Getenv("OPENAI_URL"); url != "" {
		opts = append(opts, option.WithBaseURL(url))
	}

	client := openai.NewClient(opts...)

	return &OpenAIClient{
		client: client,
		model:  model,
	}
}

// DetectVulnerability analyzes a security scan report to determine if it contains vulnerabilities
func (c *OpenAIClient) DetectVulnerability(report string) (bool, error) {
	prompt := fmt.Sprintf(`Analyze the following security scan report and determine if it contains any vulnerabilities.
Respond with only "YES" if vulnerabilities are found, or "NO" if no vulnerabilities are detected.

Report:
%s`, report)

	chatCompletion, err := c.client.Chat.Completions.New(
		context.Background(),
		openai.ChatCompletionNewParams{
			Messages: []openai.ChatCompletionMessageParamUnion{{
				OfUser: &openai.ChatCompletionUserMessageParam{
					Content: openai.ChatCompletionUserMessageParamContentUnion{
						OfString: openai.String(prompt),
					},
				},
			}},
			Model: shared.ChatModel(modelToSharedModel(c.model)),
		},
	)
	if err != nil {
		return false, fmt.Errorf("failed to call OpenAI API: %w", err)
	}

	if len(chatCompletion.Choices) == 0 {
		return false, fmt.Errorf("no choices in OpenAI response")
	}

	response := strings.TrimSpace(chatCompletion.Choices[0].Message.Content)
	return response == "YES" || containsVulnerability(response), nil
}

// GenerateIssueContent generates GitHub issue content based on a vulnerability report
func (c *OpenAIClient) GenerateIssueContent(repoName, report string) (string, error) {
	prompt := fmt.Sprintf(`Generate a professional GitHub issue body for a security vulnerability found in the repository %s.
The issue should:
- Have a clear title in the first line
- Explain the vulnerability clearly
- Provide actionable recommendations
- Be formatted in Markdown

Security scan report:
%s`, repoName, report)

	chatCompletion, err := c.client.Chat.Completions.New(
		context.Background(),
		openai.ChatCompletionNewParams{
			Messages: []openai.ChatCompletionMessageParamUnion{{
				OfUser: &openai.ChatCompletionUserMessageParam{
					Content: openai.ChatCompletionUserMessageParamContentUnion{
						OfString: openai.String(prompt),
					},
				},
			}},
			Model: shared.ChatModel(modelToSharedModel(c.model)),
		},
	)
	if err != nil {
		return "", fmt.Errorf("failed to call OpenAI API: %w", err)
	}

	if len(chatCompletion.Choices) == 0 {
		return "", fmt.Errorf("no choices in OpenAI response")
	}

	return chatCompletion.Choices[0].Message.Content, nil
}

// modelToSharedModel converts a model string to the shared.ChatModel type
// If the model is not recognized, it returns the string as-is wrapped in shared.ChatModel
func modelToSharedModel(model string) string {
	// The shared package has predefined models, but we can also use custom model strings
	// For common models, we can map them, otherwise just return the string
	switch model {
	case "gpt-4o-mini":
		return string(shared.ChatModelGPT4oMini)
	case "gpt-4o":
		return string(shared.ChatModelGPT4o)
	case "gpt-4-turbo":
		return string(shared.ChatModelGPT4Turbo)
	case "gpt-4":
		return string(shared.ChatModelGPT4)
	case "gpt-3.5-turbo":
		return string(shared.ChatModelGPT3_5Turbo)
	default:
		// For custom models or models not in the shared package, return as-is
		return model
	}
}

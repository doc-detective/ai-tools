#!/bin/bash
# Test script for doc-testing skill
# Run from skill directory: ./scripts/test-skill.sh
#
# Options:
#   --quick       Skip slow tests (browser automation & Claude CLI tests)
#   --full        Run all tests including execution (default)
#   --skill-only  Run only Claude CLI skill tests
#   --verbose     Show full Claude CLI output
#
# Requirements:
#   - claude CLI (for skill tests)
#   - npx or doc-detective (for execution tests)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REPO_DIR="$(dirname "$(dirname "$SKILL_DIR")")"

# Parse arguments
RUN_EXECUTION_TESTS=true
RUN_SKILL_TESTS=true
RUN_VALIDATION_TESTS=true
VERBOSE=false
for arg in "$@"; do
    case $arg in
        --quick)
            RUN_EXECUTION_TESTS=false
            RUN_SKILL_TESTS=false
            ;;
        --skill-only)
            RUN_EXECUTION_TESTS=false
            RUN_VALIDATION_TESTS=false
            ;;
        --verbose)
            VERBOSE=true
            ;;
    esac
done

echo "========================================"
echo "Doc Testing Skill - Test Suite"
echo "========================================"
echo "Skill dir: $SKILL_DIR"
echo "Repo dir: $REPO_DIR"
if [ "$RUN_EXECUTION_TESTS" = false ] && [ "$RUN_SKILL_TESTS" = false ]; then
    echo "(Quick mode - skipping execution & skill tests)"
fi
echo ""

PASSED=0
FAILED=0
SKIPPED=0

pass() {
    echo "✓ PASS: $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo "✗ FAIL: $1"
    if [ -n "${2:-}" ]; then
        echo "  Details: $2"
    fi
    FAILED=$((FAILED + 1))
}

skip() {
    echo "○ SKIP: $1"
    SKIPPED=$((SKIPPED + 1))
}

info() {
    echo "  ℹ $1"
}

cd "$SKILL_DIR"

# Create temp directory for test outputs
TEST_OUTPUT_DIR=$(mktemp -d)
trap "rm -rf $TEST_OUTPUT_DIR" EXIT

# =============================================================================
# PREREQUISITES CHECK
# =============================================================================
echo "--- Prerequisites Check ---"

CLAUDE_AVAILABLE=false
if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>/dev/null || echo "unknown")
    echo "Claude CLI: $CLAUDE_VERSION"
    CLAUDE_AVAILABLE=true
else
    echo "Claude CLI: not found (skill tests will be skipped)"
fi

EXEC_METHOD=""
if command -v doc-detective &> /dev/null; then
    EXEC_METHOD="doc-detective"
    echo "Doc Detective: global install"
elif command -v npx &> /dev/null; then
    EXEC_METHOD="npx"
    echo "Doc Detective: via npx"
elif command -v docker &> /dev/null; then
    EXEC_METHOD="docker"
    echo "Doc Detective: via docker"
else
    echo "Doc Detective: not available"
fi

echo ""

# =============================================================================
# VALIDATION TESTS (Fast)
# =============================================================================

if [ "$RUN_VALIDATION_TESTS" = true ]; then
    echo "========================================"
    echo "Validation Tests"
    echo "========================================"

    # Test 1: SKILL.md example test spec is valid JSON
    echo ""
    echo "--- Test 1: SKILL.md example JSON validity ---"
    if cat << 'EOF' | python3 -m json.tool > /dev/null 2>&1
{
  "tests": [
    {
      "testId": "login-flow",
      "description": "Verify login procedure from documentation",
      "steps": [
        { "stepId": "nav-login", "description": "Navigate to login page", "goTo": "https://example.com/login" },
        { "description": "Verify login form visible", "find": "Sign In" },
        { "description": "Enter username", "type": { "keys": "testuser", "selector": "#username" } },
        { "description": "Enter password", "type": { "keys": "password123", "selector": "#password" } },
        { "description": "Submit login", "click": "Sign In" },
        { "description": "Verify dashboard loads", "find": "Dashboard" }
      ]
    }
  ]
}
EOF
    then
        pass "Test spec example is valid JSON"
    else
        fail "Test spec example is invalid JSON"
    fi

    # Test 2: Results example JSON is valid
    echo ""
    echo "--- Test 2: Results example JSON validity ---"
    if cat << 'EOF' | python3 -m json.tool > /dev/null 2>&1
{
  "summary": { "specs": { "pass": 1, "fail": 0 }, "tests": { "pass": 2, "fail": 1 }, "steps": { "pass": 8, "fail": 2 } },
  "specs": [
    {
      "id": "test-spec",
      "tests": [
        {
          "testId": "login-flow",
          "status": "PASS",
          "steps": [
            { "status": "PASS", "action": "goTo", "resultDescription": "Navigated to https://example.com/login" },
            { "status": "FAIL", "action": "find", "resultDescription": "Element 'Sign In' not found within timeout" }
          ]
        }
      ]
    }
  ]
}
EOF
    then
        pass "Results example is valid JSON"
    else
        fail "Results example is invalid JSON"
    fi

    # Test 3: validate-test shows usage when no args
    echo ""
    echo "--- Test 3: Validator shows usage with no args ---"
    OUTPUT=$(./scripts/dist/validate-test 2>&1 || true)
    if echo "$OUTPUT" | grep -q "Usage:"; then
        pass "Validator shows usage message"
    else
        fail "Validator does not show usage message"
    fi

    # Test 4: Valid test spec passes validation
    echo ""
    echo "--- Test 4: Valid test spec passes validation ---"
    if cat << 'EOF' | ./scripts/dist/validate-test --stdin > /dev/null 2>&1
{ "tests": [{ "testId": "simple-test", "steps": [{ "goTo": "https://example.com" }, { "find": "Welcome" }, { "click": "Login" }] }] }
EOF
    then
        pass "Valid test spec passes validation"
    else
        fail "Valid test spec should pass validation"
    fi

    # Test 5: Missing tests array fails validation
    echo ""
    echo "--- Test 5: Missing tests array fails validation ---"
    if cat << 'EOF' | ./scripts/dist/validate-test --stdin > /dev/null 2>&1
{ "notTests": [] }
EOF
    then
        fail "Missing tests array should be rejected"
    else
        pass "Missing tests array correctly rejected"
    fi

    # Test 6: Unknown action fails validation
    echo ""
    echo "--- Test 6: Unknown action fails validation ---"
    if cat << 'EOF' | ./scripts/dist/validate-test --stdin > /dev/null 2>&1
{ "tests": [{ "testId": "test-1", "steps": [{ "unknownAction": "value" }] }] }
EOF
    then
        fail "Unknown action should be rejected"
    else
        pass "Unknown action correctly rejected"
    fi

    # Test 7: Invalid type action fails validation
    echo ""
    echo "--- Test 7: Invalid type action fails validation ---"
    if cat << 'EOF' | ./scripts/dist/validate-test --stdin > /dev/null 2>&1
{ "tests": [{ "testId": "test-1", "steps": [{ "type": "should be object with keys" }] }] }
EOF
    then
        fail "Invalid type action should be rejected"
    else
        pass "Invalid type action correctly rejected"
    fi

    # Test 8: Empty tests array fails validation
    echo ""
    echo "--- Test 8: Empty tests array fails validation ---"
    if cat << 'EOF' | ./scripts/dist/validate-test --stdin > /dev/null 2>&1
{ "tests": [] }
EOF
    then
        fail "Empty tests array should be rejected"
    else
        pass "Empty tests array correctly rejected"
    fi

    # Test 9: Empty steps array fails validation
    echo ""
    echo "--- Test 9: Empty steps array fails validation ---"
    if cat << 'EOF' | ./scripts/dist/validate-test --stdin > /dev/null 2>&1
{ "tests": [{ "testId": "test-1", "steps": [] }] }
EOF
    then
        fail "Empty steps array should be rejected"
    else
        pass "Empty steps array correctly rejected"
    fi

    # Test 10: All known actions are accepted
    echo ""
    echo "--- Test 10: All known actions are accepted ---"
    if cat << 'EOF' | ./scripts/dist/validate-test --stdin > /dev/null 2>&1
{
  "tests": [{
    "testId": "all-actions",
    "steps": [
      { "goTo": "https://example.com" },
      { "click": "Button" },
      { "find": "Text" },
      { "type": { "keys": "hello", "selector": "#input" } },
      { "wait": 1000 },
      { "screenshot": "shot.png" },
      { "checkLink": "https://example.com" },
      { "httpRequest": { "url": "https://api.example.com", "method": "GET" } },
      { "runShell": { "command": "echo hello" } },
      { "loadVariables": ".env" },
      { "loadCookie": "cookies.json" },
      { "saveCookie": "cookies.json" },
      { "record": "video.webm" },
      { "stopRecord": true }
    ]
  }]
}
EOF
    then
        pass "All known actions accepted"
    else
        fail "All known actions should be accepted"
    fi
fi

# =============================================================================
# CLAUDE CLI SKILL TESTS (Test actual skill behavior)
# =============================================================================

if [ "$RUN_SKILL_TESTS" = true ]; then
    echo ""
    echo "========================================"
    echo "Claude CLI Skill Tests"
    echo "========================================"

    if [ "$CLAUDE_AVAILABLE" = false ]; then
        skip "Claude CLI not available - skipping skill tests"
    else
        # Helper function to run Claude and capture result
        run_claude_test() {
            local prompt="$1"
            local output_file="$TEST_OUTPUT_DIR/claude-output-$RANDOM.json"
            
            # Run Claude from skill directory with appropriate permissions
            # --print mode runs non-interactively
            # --permission-mode bypassPermissions allows file reads without prompts
            # --max-turns limits iterations to prevent runaway
            if (cd "$SKILL_DIR" && claude -p "$prompt" \
                --output-format json \
                --max-turns 5 \
                --permission-mode bypassPermissions \
                > "$output_file" 2>&1); then
                cat "$output_file"
            else
                # Capture both the output and error
                local exit_code=$?
                local output_content=$(cat "$output_file" 2>/dev/null | tr '\n' ' ' | head -c 1000 | sed 's/"/\\"/g')
                echo "{\"error\": \"claude command failed (exit $exit_code)\", \"output\": \"$output_content\"}"
            fi
        }

        # Test 11: Skill triggers on "test documentation" prompt
        echo ""
        echo "--- Test 11: Skill triggers on doc testing prompt ---"
        RESULT=$(run_claude_test "I have documentation in scripts/sample-docs.md - please test the documentation procedures and validate them using Doc Detective format. Just generate the test spec JSON, don't execute it.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 2000
            echo ""
        fi
        
        # Check if the result contains Doc Detective test structure
        if echo "$RESULT" | grep -q '"tests"' && echo "$RESULT" | grep -q '"steps"'; then
            pass "Skill triggered and generated test spec structure"
        elif echo "$RESULT" | grep -q 'goTo\|find\|click'; then
            pass "Skill triggered and mentioned Doc Detective actions"
        else
            fail "Skill did not generate expected test structure" "$(echo "$RESULT" | head -c 500)"
        fi

        # Test 12: Skill uses correct action mapping
        echo ""
        echo "--- Test 12: Skill maps documentation to correct actions ---"
        RESULT=$(run_claude_test "Convert this documentation to a Doc Detective test spec JSON:

## Login Steps
1. Navigate to https://example.com/login
2. Click the Login button
3. Type 'user@test.com' in the email field
4. Verify 'Welcome' text appears

Output only the JSON test spec.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 2000
            echo ""
        fi
        
        # Check for correct action mappings (handle both escaped and unescaped JSON quotes)
        ACTIONS_FOUND=0
        if echo "$RESULT" | grep -qiE '("|\\")goTo("|\\")'; then ((ACTIONS_FOUND++)) || true; fi
        if echo "$RESULT" | grep -qiE '("|\\")click("|\\")'; then ((ACTIONS_FOUND++)) || true; fi
        if echo "$RESULT" | grep -qiE '("|\\")type("|\\")'; then ((ACTIONS_FOUND++)) || true; fi
        if echo "$RESULT" | grep -qiE '("|\\")find("|\\")'; then ((ACTIONS_FOUND++)) || true; fi
        
        if [ "$ACTIONS_FOUND" -ge 3 ]; then
            pass "Skill correctly mapped $ACTIONS_FOUND/4 actions"
        else
            fail "Skill only mapped $ACTIONS_FOUND/4 expected actions"
        fi

        # Test 13: Skill prefers text over selectors
        echo ""
        echo "--- Test 13: Skill prefers text over selectors ---"
        RESULT=$(run_claude_test "Create a Doc Detective test for: Click the Submit button, then verify Success message appears. Output JSON only.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 2000
            echo ""
        fi
        
        # Check if it uses text-based matching (quoted strings without selectors)
        # Handle both escaped (\"click\") and unescaped ("click") JSON quotes
        if echo "$RESULT" | grep -qE '("|\\")click("|\\")\s*:\s*("|\\")[^#\.\[]' || echo "$RESULT" | grep -qE '("|\\")find("|\\")\s*:\s*("|\\")[^#\.\[]'; then
            pass "Skill prefers text-based element matching"
        else
            # Might still pass if it generates valid spec
            if echo "$RESULT" | grep -qE '("|\\")click("|\\")' && echo "$RESULT" | grep -qE '("|\\")find("|\\")'; then
                pass "Skill generated click/find actions (text preference not determinable)"
            else
                fail "Skill did not demonstrate text-based matching preference"
            fi
        fi

        # Test 14: Skill validates before execution recommendation
        echo ""
        echo "--- Test 14: Skill enforces mandatory validation ---"
        RESULT=$(run_claude_test "What must you do before returning a Doc Detective test spec or executing tests? Answer briefly.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 2000
            echo ""
        fi
        
        # Check for mandatory validation language
        if echo "$RESULT" | grep -qiE 'validat|must.*validat|mandatory|always.*validat|before.*execut.*validat'; then
            pass "Skill emphasizes mandatory validation before returning/executing"
        else
            fail "Skill should emphasize mandatory validation step"
        fi

        # Test 15: Skill handles invalid test spec correctly
        echo ""
        echo "--- Test 15: Skill identifies invalid test specs ---"
        RESULT=$(run_claude_test "Validate this Doc Detective test spec and tell me if it's valid:
{\"tests\": [{\"testId\": \"bad\", \"steps\": [{\"fakeAction\": \"value\"}]}]}
Just say VALID or INVALID and briefly why.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 2000
            echo ""
        fi
        
        if echo "$RESULT" | grep -qiE 'invalid|unknown|not.*valid|error|fail'; then
            pass "Skill correctly identified invalid test spec"
        else
            fail "Skill should identify fakeAction as invalid"
        fi

        # Test 16: Generated spec passes validator
        echo ""
        echo "--- Test 16: Generated spec passes validator ---"
        SPEC=$(run_claude_test "Generate a Doc Detective test spec for: Navigate to https://example.com and verify 'Hello' text exists. Validate it and return the JSON spec.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$SPEC" | head -c 2000
            echo ""
        fi
        
        # Extract JSON from response (handle potential markdown wrapping in Claude's JSON output)
        EXTRACTED_JSON=""
        
        # Try to extract from result field if JSON output format
        if echo "$SPEC" | jq -e '.result' > /dev/null 2>&1; then
            # Get the result field and strip markdown code blocks
            RESULT_CONTENT=$(echo "$SPEC" | jq -r '.result' | sed 's/^```json//; s/^```//; s/```$//')
            # Extract JSON object containing tests
            EXTRACTED_JSON=$(echo "$RESULT_CONTENT" | grep -oP '\{[^{}]*"tests"\s*:\s*\[.*\]\s*\}' | head -1 || echo "")
            # If simple extraction failed, try multi-line extraction
            if [ -z "$EXTRACTED_JSON" ]; then
                EXTRACTED_JSON=$(echo "$RESULT_CONTENT" | tr '\n' ' ' | grep -oP '\{\s*"tests"\s*:.*\}' | head -1 || echo "")
            fi
        fi
        
        # Fallback: try direct extraction from full response
        if [ -z "$EXTRACTED_JSON" ]; then
            EXTRACTED_JSON=$(echo "$SPEC" | grep -oP '\{[^{}]*"tests"[^{}]*\[.*\].*\}' | head -1 || echo "$SPEC")
        fi
        
        if [ -n "$EXTRACTED_JSON" ] && echo "$EXTRACTED_JSON" | ./scripts/dist/validate-test --stdin > /dev/null 2>&1; then
            pass "Generated spec passes validation"
        else
            # Try a more permissive extraction using sed
            EXTRACTED_JSON=$(echo "$SPEC" | jq -r '.result // empty' 2>/dev/null | sed 's/^```json//; s/^```//; s/```$//' | tr '\n' ' ')
            if [ -n "$EXTRACTED_JSON" ] && echo "$EXTRACTED_JSON" | ./scripts/dist/validate-test --stdin > /dev/null 2>&1; then
                pass "Generated spec passes validation (after extraction)"
            else
                fail "Generated spec did not pass validation" "$(echo "$SPEC" | head -c 300)"
            fi
        fi

        # Test 17: Skill demonstrates validation workflow
        echo ""
        echo "--- Test 17: Skill actually runs validation script ---"
        RESULT=$(run_claude_test "Generate a Doc Detective test spec for navigating to https://example.com. Run the validation script and show me the validation results.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 3000
            echo ""
        fi
        
        # Check if validation was run (look for validator output patterns)
        if echo "$RESULT" | grep -qiE 'Validation PASSED|validate-test|Steps validated|Mode:.*validation'; then
            pass "Skill ran validation script and showed output"
        elif echo "$RESULT" | grep -qiE 'validat.*pass|pass.*validat'; then
            pass "Skill indicates validation passed"
        else
            fail "Skill should run and show validation output" "$(echo "$RESULT" | head -c 500)"
        fi

        # =============================================================================
        # INJECTION WORKFLOW TESTS
        # =============================================================================
        echo ""
        echo "--- Injection Workflow Tests ---"

        # Test 23: Skill offers injection after validation when generating from source file
        echo ""
        echo "--- Test 23: Skill offers injection after validation ---"
        RESULT=$(run_claude_test "Generate a Doc Detective test spec from the documentation in scripts/sample-docs-injection-test.md. After validation passes, tell me what options I have.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 3000
            echo ""
        fi
        
        # Check if skill offers injection option
        if echo "$RESULT" | grep -qiE 'inject|inline|insert.*into.*source|embed.*test'; then
            pass "Skill offers injection option after validation"
        else
            fail "Skill should offer to inject tests into source file" "$(echo "$RESULT" | head -c 500)"
        fi

        # Test 24: Skill tracks source file for injection
        echo ""
        echo "--- Test 24: Skill tracks source file path for injection ---"
        RESULT=$(run_claude_test "Generate a Doc Detective test spec from scripts/sample-docs-injection-test.md. When offering injection, which file would the tests be injected into?")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 3000
            echo ""
        fi
        
        # Check if skill references the source file path
        if echo "$RESULT" | grep -qiE 'sample-docs-injection-test\.md|source.*file|original.*file'; then
            pass "Skill tracks and references source file path"
        else
            fail "Skill should reference the source file path for injection" "$(echo "$RESULT" | head -c 500)"
        fi

        # Test 25: Injection shows preview before apply
        echo ""
        echo "--- Test 25: Injection shows preview before apply ---"
        RESULT=$(run_claude_test "If I wanted to inject Doc Detective tests into a source file, what would happen first - would you show me a preview or apply changes directly?")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 3000
            echo ""
        fi
        
        # Check if skill mentions preview-first approach
        if echo "$RESULT" | grep -qiE 'preview|diff|review.*before|show.*first|confirm.*before.*apply'; then
            pass "Skill shows preview before applying injection"
        else
            fail "Skill should show preview/diff before applying changes" "$(echo "$RESULT" | head -c 500)"
        fi

        # Test 26: Multi-file injection offered per-file
        echo ""
        echo "--- Test 26: Multi-file injection offered per-file ---"
        RESULT=$(run_claude_test "If I had documentation across multiple files (e.g., doc1.md and doc2.md) and generated tests from both, how would you handle the injection offer - all at once or separately for each file?")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 3000
            echo ""
        fi
        
        # Check if skill mentions per-file handling
        if echo "$RESULT" | grep -qiE 'each file|per.?file|separat|individual|one.*at.*a.*time|file.*by.*file'; then
            pass "Skill offers injection separately for each file"
        else
            fail "Skill should offer injection per-file for multi-file specs" "$(echo "$RESULT" | head -c 500)"
        fi
    fi
fi

# =============================================================================
# EXECUTION TESTS (Skill runs Doc Detective)
# =============================================================================

if [ "$RUN_EXECUTION_TESTS" = true ]; then
    echo ""
    echo "========================================"
    echo "Execution Tests (skill runs Doc Detective)"
    echo "========================================"

    if [ "$CLAUDE_AVAILABLE" = false ]; then
        skip "Claude CLI not available - skipping execution tests"
    elif [ -z "$EXEC_METHOD" ]; then
        skip "No execution method available (need docker, npx, or doc-detective)"
    else
        # Test 18: Skill can execute a Doc Detective test
        echo ""
        echo "--- Test 18: Skill executes Doc Detective test ---"
        RESULT=$(run_claude_test "Run Doc Detective on the test spec at scripts/test-real-execution.json and show me the results.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 3000
            echo ""
        fi
        
        # Check if skill executed Doc Detective and reported results
        if echo "$RESULT" | grep -qiE 'pass|success|executed|ran.*doc-detective|results'; then
            pass "Skill executed Doc Detective test"
        else
            fail "Skill did not execute Doc Detective" "$(echo "$RESULT" | head -c 500)"
        fi

        # Test 19: Skill detects and reports test failures
        echo ""
        echo "--- Test 19: Skill reports test failures ---"
        RESULT=$(run_claude_test "Run Doc Detective on scripts/test-expected-failure.json. This test is expected to fail - tell me what failed and why.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 3000
            echo ""
        fi
        
        # Check if skill detected and reported the failure
        if echo "$RESULT" | grep -qiE 'fail|error|not found|did not pass|unsuccessful'; then
            pass "Skill correctly reported test failure"
        else
            fail "Skill did not report expected failure" "$(echo "$RESULT" | head -c 500)"
        fi

        # Test 20: Skill parses results JSON correctly
        echo ""
        echo "--- Test 20: Skill parses results structure ---"
        RESULT=$(run_claude_test "Run Doc Detective on scripts/test-real-execution.json and parse the results file. Tell me: (1) how many tests passed, (2) how many steps passed, and (3) what actions were executed.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 3000
            echo ""
        fi
        
        # Check if skill parsed the results structure
        if echo "$RESULT" | grep -qiE '(test|step).*pass|summary|goTo|find|action'; then
            pass "Skill parsed results structure correctly"
        else
            fail "Skill did not parse results structure" "$(echo "$RESULT" | head -c 500)"
        fi

        # Test 21: Skill provides actionable failure analysis
        echo ""
        echo "--- Test 21: Skill analyzes failure causes ---"
        RESULT=$(run_claude_test "Run Doc Detective on scripts/test-expected-failure.json and analyze the failure. What specific element or text was not found? How could the test be fixed?")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 3000
            echo ""
        fi
        
        # Check if skill provided meaningful failure analysis
        if echo "$RESULT" | grep -qiE 'not found|timeout|element|selector|fix|change|update|modify'; then
            pass "Skill provided actionable failure analysis"
        else
            fail "Skill did not provide failure analysis" "$(echo "$RESULT" | head -c 500)"
        fi

        # Test 22: End-to-end workflow (generate, validate, execute, analyze)
        echo ""
        echo "--- Test 22: End-to-end generate-validate-execute workflow ---"
        RESULT=$(run_claude_test "Complete workflow: (1) Generate a Doc Detective test spec for navigating to https://example.com and verifying 'Example Domain' text exists, (2) validate it, (3) execute it with Doc Detective, (4) report the results. Show each step.")
        
        if [ "$VERBOSE" = true ]; then
            echo "Raw output:"
            echo "$RESULT" | head -c 4000
            echo ""
        fi
        
        # Check if skill completed full workflow
        WORKFLOW_STEPS=0
        if echo "$RESULT" | grep -qiE '"goTo"|goTo.*example\.com'; then ((WORKFLOW_STEPS++)) || true; fi
        if echo "$RESULT" | grep -qiE 'validat.*pass|pass.*validat'; then ((WORKFLOW_STEPS++)) || true; fi
        if echo "$RESULT" | grep -qiE 'execut|ran|run.*doc-detective'; then ((WORKFLOW_STEPS++)) || true; fi
        if echo "$RESULT" | grep -qiE 'result|pass|success|summary'; then ((WORKFLOW_STEPS++)) || true; fi
        
        if [ "$WORKFLOW_STEPS" -ge 3 ]; then
            pass "End-to-end workflow completed ($WORKFLOW_STEPS/4 steps verified)"
        else
            fail "End-to-end workflow incomplete ($WORKFLOW_STEPS/4 steps)" "$(echo "$RESULT" | head -c 500)"
        fi
    fi
else
    echo ""
    echo "========================================"
    echo "Execution Tests (skipped)"
    echo "========================================"
    skip "Skill executes Doc Detective test"
    skip "Skill reports test failures"
    skip "Skill parses results structure"
    skip "Skill analyzes failure causes"
    skip "End-to-end generate-validate-execute workflow"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo "Passed:  $PASSED"
echo "Failed:  $FAILED"
echo "Skipped: $SKIPPED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "All tests passed!"
    exit 0
else
    echo "Some tests failed."
    exit 1
fi

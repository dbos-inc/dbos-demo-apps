#!/bin/bash
# Script to run "npm run build" in every folder within a target directory
# Usage: ./build_all.sh /path/to/target/directory

# Check if target directory is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <target_directory>"
    echo "Example: $0 /home/user/projects"
    exit 1
fi

TARGET_DIR="$1"

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory '$TARGET_DIR' does not exist"
    exit 1
fi

echo "Starting build process in all folders within: $TARGET_DIR"
echo "=================================================="

# Counter for tracking builds
total_folders=0
successful_builds=0
failed_builds=0

# Function to process a directory
process_directory() {
    local dir="$1"
    local indent="$2"
    local dir_name=$(basename "$dir")
    
    ((total_folders++))
    
    echo ""
    echo "${indent}Processing folder: $dir_name"
    echo "${indent}-----------------------------------"
    
    # Check if tsconfig.json exists
    if [ ! -f "$dir/tsconfig.json" ]; then
        echo "${indent}⚠️  No tsconfig.json found in $dir_name - skipping"
        return
    fi
    
    echo "${indent}✓ Found tsconfig.json"
    
    # Check if package.json exists
    if [ -f "$dir/package.json" ]; then
        echo "${indent}✓ Found package.json"
        echo "${indent}Running npm ci in $dir_name..."
        
        # Change to the directory and run npm ci, then npm run build
        cd "$dir"
        if npm ci; then
            echo "${indent}✓ npm ci successful, running build..."
            if npm run build; then
                echo "${indent}✅ Build successful for $dir_name"
                ((successful_builds++))
            else
                echo "${indent}❌ Build failed for $dir_name"
                ((failed_builds++))
            fi
        else
            echo "${indent}❌ npm ci failed for $dir_name"
            ((failed_builds++))
        fi
        
        # Return to original directory
        cd - > /dev/null
    else
        echo "${indent}⚠️  No package.json found in $dir_name - skipping"
    fi
}

# Loop through each folder in the target directory
for folder in "$TARGET_DIR"/*; do
    # Check if it's actually a directory
    if [ -d "$folder" ]; then
        # Process the main folder
        process_directory "$folder" ""
        
        # Check for subdirectories with "-backend" in their name
        for subfolder in "$folder"/*; do
            if [ -d "$subfolder" ]; then
                subfolder_name=$(basename "$subfolder")
                if [[ "$subfolder_name" == *"-backend"* ]]; then
                    # Process the backend subfolder with indentation
                    process_directory "$subfolder" "  "
                fi
            fi
        done
    fi
done

echo ""
echo "=================================================="
echo "Build process completed!"
echo "Total folders processed: $total_folders"
echo "Successful builds: $successful_builds"
echo "Failed builds: $failed_builds"
echo "Skipped folders: $((total_folders - successful_builds - failed_builds))"

# Exit with error code if any builds failed
if [ $failed_builds -gt 0 ]; then
    exit 1
fi
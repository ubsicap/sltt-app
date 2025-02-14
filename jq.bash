#!/bin/bash

# Check if jq is installed
if ! command -v jq &> /dev/null
then
    echo "jq could not be found. Please install jq to use this script."
    exit 1
fi

# Define old and new versions
NEW_VERSION="3.0.0"

# Extract the current value of .scripts["find:version:source"]
CURRENT_VALUE_1=$(jq -r ".scripts[\"find:version:source\"]" package.json)
CURRENT_VALUE_2=$(jq -r ".scripts[\"find:version:target\"]" package.json)

# Perform the substitution using sed
NEW_VALUE_1=$(echo "$CURRENT_VALUE_1" | sed -E "s/version = \\\\\\\"[^\"]+\"/version = \\\\\\\"$NEW_VERSION\\\\\\\"/")
NEW_VALUE_2=$(echo "$CURRENT_VALUE_2" | sed -E "s/version = \\\\\\\"[^\"]+\"/version = \\\\\\\"$NEW_VERSION\\\\\\\"/")

echo CURRENT_VALUE_1: $CURRENT_VALUE_1
echo NEW_VALUE_1____: $NEW_VALUE_1
echo CURRENT_VALUE_2: $CURRENT_VALUE_2
echo NEW_VALUE_2____: $NEW_VALUE_2

# Update package.json with the new value
# jq --arg new_value "$NEW_VALUE" '.scripts["find:version:source"] = $new_value' "$PACKAGE_JSON_PATH" > "$TEMP_JSON_PATH" && mv "$TEMP_JSON_PATH" "$PACKAGE_JSON_PATH"
# jq --arg new_value "$NEW_VALUE_1" '.scripts["find:version:source"] = "new_value_for_source" | .scripts["find:version:target"] = "new_value_for_target"' # package.json > package.tmp.json && mv package.tmp.json package.json
jq --arg new_value_1 "$NEW_VALUE_1" --arg new_value_2 "$NEW_VALUE_2" '.scripts["find:version:source"] = $new_value_1 | .scripts["find:version:target"] = $new_value_2' package.json # > package.tmp.json && mv package.tmp.json package.json
# jq '.scripts["find:version:source"] = "findstr /S /M /C:\"version = \\\"new_version_source\\\"\" %SLTT_CLIENT_DIR%\\build\\assets\\index-*.js" | .scripts["find:version:target"] = "findstr /S /M /C:\"version = \\\"new_version_target\\\"\" out\\client\\assets\\index-*.js"' package.json > package.tmp.json && mv package.tmp.json package.json


# Print the updated package.json
# cat "$PACKAGE_JSON_PATH"
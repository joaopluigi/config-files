#!/bin/bash

VIDEO="$1"

# If no output name provided, derive from input video name
if [ -z "$2" ]; then
    # Get basename without path, remove extension, add .gif
    OUTPUT="$(basename "${VIDEO%.*}").gif"
else
    OUTPUT="$2"
fi

MAX_SIZE_MB=10
MAX_SIZE_BYTES=$((MAX_SIZE_MB * 1024 * 1024))

# Initial parameters
FPS=15
SCALE=600

# Function to get file size in bytes
get_file_size() {
    stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null
}

# Function to generate GIF with given parameters
generate_gif() {
    local fps=$1
    local scale=$2

    echo "Generating GIF with fps=$fps, scale=$scale..."

    # Generate palette
    ffmpeg -y -i "$VIDEO" -vf "fps=$fps,scale=$scale:-1:flags=lanczos,palettegen" /tmp/palette.png

    # Generate gif
    ffmpeg -y -i "$VIDEO" -i /tmp/palette.png -filter_complex "fps=$fps,scale=$scale:-1:flags=lanczos[x];[x][1:v]paletteuse" "$OUTPUT"

    return $?
}

# Try generating with initial parameters
generate_gif $FPS $SCALE

if [ $? -ne 0 ]; then
    echo "Error generating GIF"
    exit 1
fi

# Check file size and adjust if needed
FILE_SIZE=$(get_file_size "$OUTPUT")
echo "Initial GIF size: $((FILE_SIZE / 1024 / 1024))MB"

if [ $FILE_SIZE -gt $MAX_SIZE_BYTES ]; then
    echo "File too large, optimizing..."

    # Try reducing FPS first
    FPS=10
    generate_gif $FPS $SCALE
    FILE_SIZE=$(get_file_size "$OUTPUT")
    echo "After FPS reduction: $((FILE_SIZE / 1024 / 1024))MB"
fi

if [ $FILE_SIZE -gt $MAX_SIZE_BYTES ]; then
    # Try reducing scale
    SCALE=500
    generate_gif $FPS $SCALE
    FILE_SIZE=$(get_file_size "$OUTPUT")
    echo "After scale reduction: $((FILE_SIZE / 1024 / 1024))MB"
fi

if [ $FILE_SIZE -gt $MAX_SIZE_BYTES ]; then
    # More aggressive reduction
    FPS=8
    SCALE=400
    generate_gif $FPS $SCALE
    FILE_SIZE=$(get_file_size "$OUTPUT")
    echo "After aggressive reduction: $((FILE_SIZE / 1024 / 1024))MB"
fi

if [ $FILE_SIZE -gt $MAX_SIZE_BYTES ]; then
    echo "Warning: GIF is still larger than ${MAX_SIZE_MB}MB ($((FILE_SIZE / 1024 / 1024))MB)"
    echo "You may need to trim the video or reduce quality further"
else
    echo "✓ GIF size OK: $((FILE_SIZE / 1024 / 1024))MB (under ${MAX_SIZE_MB}MB limit)"
fi

echo "Generated at $(pwd)/$OUTPUT"

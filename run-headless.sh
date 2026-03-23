#!/bin/bash
# Wrapper to run hail mary scripts with virtual display (xvfb)
# Usage: ./run-headless.sh <tool> [params-json]
# Example: ./run-headless.sh screenshot '{"filename":"test.png"}'
xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" node /home/ubuntu/.openclaw/workspace/hailmary/index.js "$@"

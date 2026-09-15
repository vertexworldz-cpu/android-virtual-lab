#!/usr/bin/env bash
# Helper script to initialize official Google Play system images and AVDs
set -e

echo "=== Android Virtual Lab - AVD Setup Helper ==="

if [ -d "/usr/local/opt/openjdk@17" ]; then
    export JAVA_HOME="/usr/local/opt/openjdk@17"
    export PATH="$JAVA_HOME/bin:$PATH"
fi

SDK_ROOT="${ANDROID_SDK_ROOT:-/usr/local/share/android-commandlinetools}"

echo "SDK Root: $SDK_ROOT"
echo "Java Version:"
java -version 2>&1 | head -n 2

echo ""
echo "To download the recommended Google Play Android 14 System Image:"
echo "yes | sdkmanager --sdk_root=\"$SDK_ROOT\" \"system-images;android-34;google_apis_playstore;x86_64\""
echo ""
echo "To create the AVD via CLI:"
echo "avdmanager create avd -n Pixel_8_API_34 -k \"system-images;android-34;google_apis_playstore;x86_64\" -d pixel_8 --force"
echo ""
echo "All done!"

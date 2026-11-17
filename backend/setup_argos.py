
import argostranslate.package

languages = ["kn", "hi", "te", "ta"]

print("Updating Argos language package list...")

try:
    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()

    print("\nChecking available English translation models...\n")

    for target in languages:
        matches = [
            package for package in available
            if package.from_code == "en"
            and package.to_code == target
        ]

        if not matches:
            print(f"NOT AVAILABLE: English -> {target}")
            continue

        package = matches[0]
        print(f"Downloading: English -> {target}")

        try:
            download_path = package.download()
            argostranslate.package.install_from_path(download_path)
            print(f"SUCCESS: English -> {target}")

        except Exception as error:
            print(f"FAILED: English -> {target}: {error}")

    print("\nLanguage model setup finished.")

except Exception as error:
    print("Could not retrieve language packages:", error)

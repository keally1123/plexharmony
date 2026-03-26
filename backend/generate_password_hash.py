#!/usr/bin/env python3
"""
Utility to generate a bcrypt password hash for ADMIN_PASSWORD_HASH in .env
Run: python generate_password_hash.py
"""
import getpass
import bcrypt


def main():
    print("PlexHarmony - Password Hash Generator")
    print("=" * 40)
    password = getpass.getpass("Enter admin password: ")
    confirm = getpass.getpass("Confirm password: ")

    if password != confirm:
        print("ERROR: Passwords do not match.")
        return

    if len(password) < 12:
        print("WARNING: Password is less than 12 characters. Consider a stronger password.")

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12))
    print("\nAdd this to your .env file:")
    print(f'ADMIN_PASSWORD_HASH="{hashed.decode()}"')


if __name__ == "__main__":
    main()

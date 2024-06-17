## Farcaster Replicator by justbuild

A lightweight, easy to use nodejs app that replicates farcaster data into a postgres database.

## How it works?
- First step is determining the last synced farcaster message. 
    This can come as an environment variable, read from readis in case the replicator was already started once
    or it will be fetch from the hub.
- Second step is backfilling data from the hub for each FID. Currently it only syncs casts, replies and user_data.
    If you need more, submit a request.
- Third step is subscribing to events and update the database according to them (this will run forever).

## Usage
In the docker-compose.yml update the environment variables according to your needs the run docker compose up. That's it, enjoy!



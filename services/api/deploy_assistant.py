"""Deploy the AISA Asisten to Vertex AI Agent Runtime (Agent Engine) with Memory Bank.

Run from anywhere (the script changes into services/api so ``aisa/assistant`` is
shipped with its package path intact):

    uv run python deploy_assistant.py                       # create a new engine
    uv run python deploy_assistant.py --update <resource>   # redeploy in place

The engine runs in AGENT_LOCATION (us-central1) and hosts Sessions and Memory Bank;
the model itself is called at the ``global`` location because Gemini 3.x is only
served there in this project. Only ``aisa/assistant`` is packaged, never the rest of
``aisa``.

The engine's service agent (service-<number>@gcp-sa-aiplatform-re.iam.gserviceaccount.com)
needs read access to Firestore (roles/datastore.viewer) for the tools to work.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "hackathon-primestep-09")
AGENT_LOCATION = os.environ.get("AGENT_LOCATION", "us-central1")
STAGING_BUCKET = os.environ.get("STAGING_BUCKET", f"gs://{PROJECT}-aisa-staging")
RUNTIME_SA = os.environ.get("ASSISTANT_SERVICE_ACCOUNT", f"hackathon-runtime@{PROJECT}.iam.gserviceaccount.com")
MODEL = os.environ.get("ASSISTANT_MODEL", "gemini-3.8-flash")

# Pinned to the versions the agent was built and tested against; the pickled agent must
# unpickle with the same ADK and cloudpickle it was pickled with.
REQUIREMENTS = [
    "google-adk==2.12.0",
    "google-cloud-aiplatform[agent_engines,adk]==2.6.0",
    "google-cloud-firestore==2.34.1",
    "google-genai==2.32.0",
    "cloudpickle==3.1.2",
    "pydantic==2.14.1",
]

# Memory Bank keeps only the manager's preferences; proposal data always comes from
# Firestore through the tools.
MEMORY_BANK = {
    "customization_configs": [
        {
            "memory_topics": [
                {"managed_memory_topic": {"managed_topic_enum": "USER_PREFERENCES"}},
                {
                    "custom_memory_topic": {
                        "label": "preferensi_manajer",
                        "description": (
                            "Preferensi manajer investasi tentang cara asisten menjawab: gaya dan "
                            "panjang jawaban, sektor atau tahap pendanaan yang sering diminati, "
                            "cara disapa. JANGAN simpan data proposal, nama startup, skor, "
                            "kategori, angka, atau kontak founder."
                        ),
                    }
                },
            ]
        }
    ]
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--update", metavar="RESOURCE", help="existing reasoningEngines resource name")
    args = parser.parse_args()

    os.chdir(HERE)
    sys.path.insert(0, str(HERE))
    os.environ["ASSISTANT_MODEL"] = MODEL

    import vertexai
    from vertexai.agent_engines import AdkApp

    from aisa.assistant.agent import root_agent

    # AdkApp records the engine location from the global config; Sessions and Memory
    # Bank are created there.
    vertexai.init(project=PROJECT, location=AGENT_LOCATION, staging_bucket=STAGING_BUCKET)
    client = vertexai.Client(project=PROJECT, location=AGENT_LOCATION)

    app = AdkApp(agent=root_agent, enable_tracing=True)
    config = {
        "display_name": "aisa-asisten",
        "description": "Asisten AISA: menjawab pertanyaan manajer tentang data proposal (baca saja).",
        "staging_bucket": STAGING_BUCKET,
        "requirements": REQUIREMENTS,
        "extra_packages": ["aisa/assistant"],
        "env_vars": {
            "GOOGLE_GENAI_USE_VERTEXAI": "true",
            "GOOGLE_CLOUD_LOCATION": "global",
            "ASSISTANT_MODEL": MODEL,
            "ASSISTANT_MODEL_LOCATION": "global",
            "FIRESTORE_PROJECT": PROJECT,
        },
        "context_spec": {"memory_bank_config": MEMORY_BANK},
        # The default Reasoning Engine service agent has no Firestore role; the runtime SA does.
        "service_account": RUNTIME_SA,
    }

    if args.update:
        engine = client.agent_engines.update(name=args.update, agent=app, config=config)
    else:
        engine = client.agent_engines.create(agent=app, config=config)
    print(engine.api_resource.name)


if __name__ == "__main__":
    main()

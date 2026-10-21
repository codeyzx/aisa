"""Deleting a proposal also removes the Asisten state that may still name it: the Agent
Runtime sessions (with their `assistantSessions` mappings) and the Memory Bank memories
whose fact mentions it. A failure there never fails or rolls back the Firestore deletion."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from conftest import MANAGER, seed_proposal

from aisa import assistant_client as ac
from aisa import domain, storage
from aisa.models import Via

ENGINE = "projects/p/locations/us-central1/reasoningEngines/42"
NAME = "Tani Maju"


class NotFoundError(Exception):
    code = 404


class FakeAgentRuntime:
    """The slice of `vertexai.Client().agent_engines` that forget() calls."""

    def __init__(self, sessions: list[str], memories: dict[str, str], fail: Exception | None = None):
        self.sessions_left = {f"{ENGINE}/sessions/{s}" for s in sessions}
        self.memories_left = {f"{ENGINE}/memories/{k}": v for k, v in memories.items()}
        self.fail = fail
        rt = self

        class Sessions:
            def list(self, *, name):
                assert name == ENGINE
                if rt.fail:
                    raise rt.fail
                return [SimpleNamespace(name=n) for n in sorted(rt.sessions_left)]

            def delete(self, *, name):
                if name not in rt.sessions_left:
                    raise NotFoundError(name)
                rt.sessions_left.remove(name)

        class Memories:
            def list(self, *, name):
                assert name == ENGINE
                return [SimpleNamespace(name=n, fact=f) for n, f in rt.memories_left.items()]

            def delete(self, *, name):
                del rt.memories_left[name]

        self.agent_engines = SimpleNamespace(sessions=Sessions(), memories=Memories())


@pytest.fixture
def remote(fs, env):
    env.setattr(storage, "delete_deck", lambda path: True)
    env.setattr(ac, "settings", lambda: SimpleNamespace(assistant_engine_id=ENGINE, project="p"))
    seed_proposal(fs, "p1", NAME)
    fs.document(f"assistantSessions/{MANAGER}").set({"date": "2026-10-21", "sessionId": "s-phone"})
    fs.document("assistantSessions/dashboard-u1-c1").set({"date": "2026-10-21", "sessionId": "s-dash"})

    def install(rt: FakeAgentRuntime) -> FakeAgentRuntime:
        env.setattr(ac, "_client", lambda: rt)
        return rt

    return install


def test_sessions_and_mappings_go_and_only_memories_naming_it(remote, fs):
    rt = remote(FakeAgentRuntime(
        # s-old: an earlier day's session no mapping points to any more.
        sessions=["s-phone", "s-dash", "s-old"],
        memories={"m1": "Manajer bertanya soal TANI MAJU", "m2": "Suka jawaban singkat",
                  "m3": "Tertarik pada Tani Majumundur"}))  # a longer word, not the name

    out = domain.delete_proposal("p1", "permintaan founder", Via.dashboard)

    assert out == {"deleted": True, "assistantScrub": {"sessions": 3, "memories": 1}}
    assert rt.sessions_left == set()
    assert fs.all("assistantSessions") == {}
    assert sorted(rt.memories_left) == [f"{ENGINE}/memories/m2", f"{ENGINE}/memories/m3"]


def test_a_mapped_session_already_gone_is_not_an_error(remote, fs):
    remote(FakeAgentRuntime(sessions=["s-phone"], memories={}))
    out = domain.delete_proposal("p1", "permintaan founder", Via.dashboard)
    assert out["assistantScrub"] == {"sessions": 1, "memories": 0}
    assert fs.all("assistantSessions") == {}


def test_engine_error_is_reported_and_the_deletion_stands(remote, fs):
    remote(FakeAgentRuntime(sessions=["s-phone"], memories={"m1": NAME},
                            fail=RuntimeError("503 UNAVAILABLE")))
    out = domain.delete_proposal("p1", "permintaan founder", Via.dashboard)
    assert out["deleted"] is True
    assert out["assistantScrub"] == {"sessions": 0, "memories": 0, "error": "503 UNAVAILABLE"}
    assert fs.get("proposals/p1") is None
    assert [h["action"] for h in fs.all("history").values()] == ["proposal_dihapus"]
    # The mappings are dropped before Agent Runtime is called, so the next question starts
    # a fresh session even though the old one could not be deleted.
    assert fs.all("assistantSessions") == {}


def test_local_runner_sessions_are_cleared(fs, env):
    env.setattr(storage, "delete_deck", lambda path: True)
    env.setattr(ac, "settings", lambda: SimpleNamespace(assistant_engine_id=""))
    seed_proposal(fs, "p1", NAME)
    ac._runner.cache_clear()
    try:
        svc = ac._runner().session_service
        svc.sessions["aisa"] = {MANAGER: {"a": object(), "b": object()},
                                "dashboard-u1-c1": {"c": object()}}
        out = domain.delete_proposal("p1", "permintaan founder", Via.dashboard)
        assert out["assistantScrub"] == {"sessions": 3, "memories": 0}
        assert svc.sessions == {}
    finally:
        ac._runner.cache_clear()


def test_local_without_a_runner_builds_nothing(fs, env):
    env.setattr(storage, "delete_deck", lambda path: True)
    env.setattr(ac, "settings", lambda: SimpleNamespace(assistant_engine_id=""))
    seed_proposal(fs, "p1", NAME)
    ac._runner.cache_clear()
    out = domain.delete_proposal("p1", "permintaan founder", Via.dashboard)
    assert out["assistantScrub"] == {"sessions": 0, "memories": 0}
    assert ac._runner.cache_info().currsize == 0

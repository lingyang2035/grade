from datetime import timedelta

from app.domain import local_today

from helpers import api, api_token, setup_admin


def ymd(days=0):
    return (local_today() + timedelta(days=days)).isoformat()


def create_exam(client, payload, token=None):
    return api(client, "post", "/api/exams", payload, token)


def set_cohort(client, class_count, grade_count, token=None):
    return api(
        client,
        "put",
        "/api/settings/cohort",
        {"classCount": class_count, "gradeCount": grade_count},
        token,
    )


def full_mock_payload():
    return {
        "name": "全科模拟",
        "date": ymd(-1),
        "kind": "zhongkaoMock",
        "scope": "school",
        "classRank": 10,
        "gradeRank": 100,
        "scores": {
            "chinese": {"score": 120, "max": 150},
            "math": {"score": 130, "max": 150},
            "english": {"score": 135, "max": 150},
            "physics": {"score": 60, "max": 80},
            "chemistry": {"score": 45, "max": 55},
            "civics": {"score": 55, "max": 60},
            "history": {"score": 52, "max": 60},
            "interdisciplinary": {"score": 12, "max": 15},
            "sports": {"score": 28, "max": 30},
        },
        "scoreStatuses": {},
        "note": "",
    }


def test_mock_total_is_750_and_subject_max_can_vary_within_750(client):
    setup_admin(client)
    payload = full_mock_payload()
    # 本场可逐科调整，但合计必须仍为 750。
    payload["scores"]["chinese"]["max"] = 140
    payload["scores"]["physics"]["max"] = 90
    response = create_exam(client, payload)
    assert response.status_code == 200, response.get_json()
    exam = response.get_json()["data"]["exams"][0]
    assert exam["total"]["max"] == 750
    assert exam["total"]["score"] == 637
    assert exam["total"]["partialMock"] is False
    assert exam["total"]["signature"].startswith("zhongkaoMock|")
    assert "chinese:140.0" in exam["total"]["signature"]
    assert exam["scores"]["chinese"]["max"] == 140
    assert exam["scores"]["physics"]["max"] == 90


def test_mock_total_must_be_750(client):
    setup_admin(client)
    payload = full_mock_payload()
    payload["scores"]["chinese"]["max"] = 140
    response = create_exam(client, payload)
    assert response.status_code == 400
    assert "750" in response.get_json()["error"]


def test_legacy_and_new_exam_kinds_and_scopes_are_accepted(client):
    setup_admin(client)
    base = {
        "name": "范围校验",
        "date": ymd(-1),
        "classRank": None,
        "gradeRank": None,
        "scores": {"math": {"score": 90, "max": 100}},
        "scoreStatuses": {},
        "note": "",
    }
    for kind in ("weekly", "stage", "term", "zhongkaoMock", "unit", "other"):
        payload = dict(base, kind=kind, scope="class")
        if kind == "zhongkaoMock":
            payload["scores"] = {"math": {"score": 90, "max": 150}}
        response = create_exam(client, payload)
        assert response.status_code == 200, (kind, response.get_json())
    for scope in ("class", "school", "district", "external", "joint", "other"):
        assert create_exam(client, dict(base, kind="stage", scope=scope)).status_code == 200, scope
    assert create_exam(client, dict(base, kind="unknown", scope="school")).status_code == 400
    assert create_exam(client, dict(base, kind="stage", scope="unknown")).status_code == 400


def test_org_name_is_saved_and_returned(client):
    setup_admin(client)
    payload = {
        "name": "机构测验",
        "date": ymd(-1),
        "kind": "weekly",
        "scope": "external",
        "orgName": "某某培训",
        "classRank": None,
        "gradeRank": None,
        "scores": {"english": {"score": 0, "max": 100}},
        "scoreStatuses": {"physics": "pending"},
        "note": "",
    }
    response = create_exam(client, payload)
    assert response.status_code == 200, response.get_json()
    exam = response.get_json()["data"]["exams"][0]
    assert exam["orgName"] == "某某培训"
    assert exam["total"]["score"] == 0
    assert exam["total"]["max"] == 100
    assert exam["total"]["count"] == 1
    assert exam["scoreStatuses"] == {"physics": "pending"}


def test_partial_mock_shows_subtotal_without_comparable_signature(client):
    setup_admin(client)
    payload = full_mock_payload()
    payload["scores"] = {
        "chinese": {"score": 120, "max": 150},
        "math": {"score": 130, "max": 150},
    }
    response = create_exam(client, payload)
    assert response.status_code == 200
    exam = response.get_json()["data"]["exams"][0]
    assert exam["total"]["score"] == 250
    assert exam["total"]["max"] == 750
    assert exam["total"]["partialMock"] is True
    assert exam["total"]["signature"] is None
    assert exam["total"]["count"] == 2


def test_custom_exam_totals_statuses_and_rank_share(client):
    setup_admin(client)
    assert set_cohort(client, 40, 400).status_code == 200
    payload = {
        "name": "单元测验",
        "date": ymd(-3),
        "kind": "unit",
        "scope": "school",
        "classRank": 10,
        "gradeRank": 100,
        "scores": {
            "chinese": {"score": 120, "max": 150},
            "math": {"score": 100, "max": 150},
        },
        "scoreStatuses": {"physics": "pending"},
        "note": "",
    }
    response = create_exam(client, payload)
    assert response.status_code == 200, response.get_json()
    exam = response.get_json()["data"]["exams"][0]
    assert exam["total"]["score"] == 220
    assert exam["total"]["max"] == 300
    assert exam["total"]["partialMock"] is False
    assert exam["total"]["signature"].startswith("custom|")
    assert exam["scoreStatuses"] == {"physics": "pending"}
    assert exam["classShare"] == 25.0
    assert exam["gradeShare"] == 25.0


def test_missing_counts_means_no_rank_share(client):
    setup_admin(client)
    payload = full_mock_payload()
    response = create_exam(client, payload)
    exam = response.get_json()["data"]["exams"][0]
    assert exam["classCount"] is None
    assert exam["classShare"] is None


def test_edit_keeps_cohort_snapshot_and_new_exam_uses_new_settings(client):
    setup_admin(client)
    set_cohort(client, 40, 400)
    first = full_mock_payload()
    response = create_exam(client, first)
    assert response.status_code == 200
    exam = response.get_json()["data"]["exams"][0]
    assert exam["classCount"] == 40
    assert exam["gradeCount"] == 400
    assert set_cohort(client, 50, 500).status_code == 200
    first["name"] = "改名后的模拟"
    response = api(client, "put", f"/api/exams/{exam['id']}", first)
    assert response.status_code == 200
    updated = next(item for item in response.get_json()["data"]["exams"] if item["id"] == exam["id"])
    assert updated["name"] == "改名后的模拟"
    assert updated["classCount"] == 40
    assert updated["gradeCount"] == 400
    second = full_mock_payload()
    second["name"] = "新考试"
    response = create_exam(client, second)
    new_exam = next(item for item in response.get_json()["data"]["exams"] if item["name"] == "新考试")
    assert new_exam["classCount"] == 50
    assert new_exam["gradeCount"] == 500


def test_update_clears_removed_status_and_recomputes_total(client):
    setup_admin(client)
    payload = {
        "name": "更新测试",
        "date": ymd(-2),
        "kind": "other",
        "scope": "school",
        "classRank": None,
        "gradeRank": None,
        "scores": {"math": {"score": 100, "max": 150}},
        "scoreStatuses": {"physics": "absent"},
        "note": "",
    }
    response = create_exam(client, payload)
    exam = response.get_json()["data"]["exams"][0]
    payload["scores"] = {"math": {"score": 120, "max": 150}}
    payload["scoreStatuses"] = {}
    response = api(client, "put", f"/api/exams/{exam['id']}", payload)
    updated = response.get_json()["data"]["exams"][0]
    assert updated["scores"]["math"]["score"] == 120
    assert updated["scoreStatuses"] == {}
    assert updated["total"]["score"] == 120


def test_exam_validation_errors(client):
    setup_admin(client)
    assert set_cohort(client, 40, 400).status_code == 200
    base = full_mock_payload()

    future = dict(base, date=ymd(1))
    response = create_exam(client, future)
    assert response.status_code == 400
    assert "不能晚于今天" in response.get_json()["error"]

    over = dict(base, scores={"chinese": {"score": 151, "max": 150}})
    response = create_exam(client, over)
    assert response.status_code == 400
    assert "得分不能超过满分" in response.get_json()["error"]

    rank = dict(base, classRank=41, gradeRank=100)
    response = create_exam(client, rank)
    assert response.status_code == 400
    assert "名次不能大于参考人数" in response.get_json()["error"]

    both = dict(base, scores={"chinese": {"score": 120, "max": 150}}, scoreStatuses={"chinese": "absent"})
    response = create_exam(client, both)
    assert response.status_code == 400
    assert "不能同时录入" in response.get_json()["error"]

    empty = {
        "name": "空考试",
        "date": ymd(-1),
        "kind": "unit",
        "scope": "school",
        "classRank": None,
        "gradeRank": None,
        "scores": {},
        "scoreStatuses": {},
    }
    response = create_exam(client, empty)
    assert response.status_code == 400
    assert "请至少录入" in response.get_json()["error"]

    unknown = dict(base, scores={"unknown": {"score": 1, "max": 1}})
    response = create_exam(client, unknown)
    assert response.status_code == 400
    assert "未知学科" in response.get_json()["error"]


def test_exam_requires_login(client, app):
    setup_admin(client)
    anonymous = app.test_client()
    payload = full_mock_payload()
    assert anonymous.post("/api/exams", json=payload).status_code == 401
    token = api_token(client)
    assert create_exam(client, payload, token).status_code == 200


def test_mock_score_requires_explicit_max(client):
    setup_admin(client)
    payload = full_mock_payload()
    payload["scores"] = {"chinese": {"score": 120}}
    response = create_exam(client, payload)
    assert response.status_code == 400
    assert "满分" in response.get_json()["error"]


def test_changing_score_maxima_does_not_change_historical_exam(client):
    setup_admin(client)
    assert api(client, "put", "/api/settings/score-maxima/regular", {"math": 100}).status_code == 200
    payload = {
        "name": "满分快照",
        "date": ymd(-1),
        "kind": "unit",
        "scope": "school",
        "classRank": None,
        "gradeRank": None,
        "scores": {"math": {"score": 90, "max": 100}},
        "scoreStatuses": {},
        "note": "",
    }
    response = create_exam(client, payload)
    assert response.status_code == 200
    exam_id = response.get_json()["examId"]
    assert api(client, "put", "/api/settings/score-maxima/regular", {"math": 120}).status_code == 200
    exam = next(item for item in client.get("/api/bootstrap").get_json()["data"]["exams"] if item["id"] == exam_id)
    assert exam["scores"]["math"] == {"score": 90, "max": 100}
    assert exam["total"]["max"] == 100


def test_zero_score_is_valid_and_statuses_are_not_counted_as_zero(client):
    setup_admin(client)
    payload = {
        "name": "零分测试",
        "date": ymd(-1),
        "kind": "other",
        "scope": "school",
        "classRank": None,
        "gradeRank": None,
        "scores": {"math": {"score": 0, "max": 150}},
        "scoreStatuses": {"physics": "absent", "chemistry": "pending", "chinese": "untested"},
        "note": "",
    }
    response = create_exam(client, payload)
    assert response.status_code == 200, response.get_json()
    exam = response.get_json()["data"]["exams"][0]
    assert exam["total"]["score"] == 0
    assert exam["total"]["max"] == 150
    assert exam["total"]["count"] == 1
    assert exam["scoreStatuses"] == {"physics": "absent", "chemistry": "pending", "chinese": "untested"}

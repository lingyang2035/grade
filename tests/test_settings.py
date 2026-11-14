from datetime import date, timedelta

from helpers import api, api_token, create_account, create_family, login, change_password, setup_admin


def test_settings_update_and_clear(client):
    setup_admin(client)
    assert api(client, "put", "/api/settings/profile", {"studentName": "小李", "grade": "初三", "className": "3 班"}).status_code == 200
    boot = client.get("/api/bootstrap").get_json()
    assert boot["data"]["profile"] == {"studentName": "小李", "grade": "初三", "className": "3 班"}

    assert api(client, "put", "/api/settings/cohort", {"classCount": 45, "gradeCount": 450}).status_code == 200
    assert api(client, "put", "/api/settings/target", {"target": 100}).status_code == 200
    boot = client.get("/api/bootstrap").get_json()
    assert boot["data"]["cohort"] == {"classCount": 45, "gradeCount": 450}
    assert boot["data"]["target"] == 100

    assert api(client, "put", "/api/settings/subject-targets", {"math": 85, "english": 90}).status_code == 200
    boot = client.get("/api/bootstrap").get_json()
    assert boot["data"]["subjectTargets"] == {"math": 85.0, "english": 90.0}

    assert api(client, "put", "/api/settings/subject-targets", {}).status_code == 200
    assert client.get("/api/bootstrap").get_json()["data"]["subjectTargets"] == {}
    assert api(client, "put", "/api/settings/target", {"target": None}).status_code == 200
    assert client.get("/api/bootstrap").get_json()["data"]["target"] is None
    assert api(client, "put", "/api/settings/cohort", {"classCount": None, "gradeCount": None}).status_code == 200
    assert client.get("/api/bootstrap").get_json()["data"]["cohort"] == {"classCount": None, "gradeCount": None}


def test_settings_validation(client):
    setup_admin(client)
    assert api(client, "put", "/api/settings/profile", {"studentName": "", "grade": "", "className": ""}).status_code == 400
    assert api(client, "put", "/api/settings/profile", {"studentName": "小李", "grade": "高三", "className": ""}).status_code == 400
    assert api(client, "put", "/api/settings/cohort", {"classCount": 50, "gradeCount": 40}).status_code == 400
    assert api(client, "put", "/api/settings/target", {"target": 0}).status_code == 400
    assert api(client, "put", "/api/settings/subject-targets", {"math": 101}).status_code == 400
    assert api(client, "put", "/api/settings/subject-targets", {"unknown": 80}).status_code == 400


def test_score_maxima_defaults_update_and_clear(client):
    setup_admin(client)
    boot = client.get("/api/bootstrap").get_json()
    maxima = boot["data"]["scoreMaxima"]
    assert maxima["mock"] == {
        "chinese": 150,
        "math": 150,
        "english": 150,
        "physics": 80,
        "chemistry": 55,
        "civics": 60,
        "history": 60,
        "interdisciplinary": 15,
        "sports": 30,
    }
    assert maxima["regular"] == {
        "chinese": 100,
        "math": 100,
        "english": 100,
        "physics": 70,
        "chemistry": 50,
        "civics": 30,
        "history": 30,
        "interdisciplinary": None,
        "sports": None,
    }

    response = api(
        client,
        "put",
        "/api/settings/score-maxima/regular",
        {"math": 120, "civics": None, "sports": 40},
    )
    assert response.status_code == 200, response.get_json()
    saved = response.get_json()["data"]["scoreMaxima"]
    assert saved["regular"]["math"] == 120
    assert saved["regular"]["civics"] is None
    assert saved["regular"]["sports"] == 40
    assert saved["regular"]["chinese"] == 100
    assert saved["mock"]["math"] == 150

    response = api(client, "put", "/api/settings/score-maxima/mock", {"physics": 75})
    assert response.status_code == 200
    saved = response.get_json()["data"]["scoreMaxima"]
    assert saved["mock"]["physics"] == 75
    assert saved["mock"]["chinese"] == 150
    assert saved["regular"]["math"] == 120

    clear = {
        "chinese": None, "math": None, "english": None, "physics": None,
        "chemistry": None, "civics": None, "history": None,
        "interdisciplinary": None, "sports": None,
    }
    response = api(client, "put", "/api/settings/score-maxima/regular", clear)
    assert response.status_code == 200
    assert all(value is None for value in response.get_json()["data"]["scoreMaxima"]["regular"].values())


def test_score_maxima_validation(client):
    setup_admin(client)
    assert api(client, "put", "/api/settings/score-maxima/regular", {"unknown": 100}).status_code == 400
    assert api(client, "put", "/api/settings/score-maxima/regular", {"math": 0}).status_code == 400
    assert api(client, "put", "/api/settings/score-maxima/regular", {"math": -1}).status_code == 400
    assert api(client, "put", "/api/settings/score-maxima/regular", {"math": 1001}).status_code == 400
    assert api(client, "put", "/api/settings/score-maxima/regular", {"math": "abc"}).status_code == 400
    assert api(client, "put", "/api/settings/score-maxima/invalid", {"math": 100}).status_code == 404


def test_settings_are_family_scoped(client, app):
    setup_admin(client)
    family_b = create_family(client, name="第二家", student_name="小红")
    parent_b = create_account(
        client,
        username="parent_b",
        name="第二家家长",
        family_id=family_b,
    )
    temp = parent_b.get_json()["tempPassword"]
    client_b = app.test_client()
    login(client_b, "parent_b", temp)
    change_password(client_b, temp, "parent-b-pass")
    assert client_b.get("/api/bootstrap").get_json()["data"]["family"]["name"] == "第二家"

    api(client, "put", "/api/settings/target", {"target": 120})
    api(client, "put", "/api/settings/subject-targets", {"math": 80})
    api(client, "put", "/api/settings/score-maxima/regular", {"math": 120})
    boot_b = client_b.get("/api/bootstrap").get_json()["data"]
    assert boot_b["target"] is None
    assert boot_b["subjectTargets"] == {}
    assert boot_b["scoreMaxima"]["regular"]["math"] == 100

    api(client_b, "put", "/api/settings/target", {"target": 200})
    api(client_b, "put", "/api/settings/subject-targets", {"math": 95})
    api(client_b, "put", "/api/settings/score-maxima/regular", {"math": 90})
    boot_a = client.get("/api/bootstrap").get_json()["data"]
    boot_b = client_b.get("/api/bootstrap").get_json()["data"]
    assert boot_a["target"] == 120
    assert boot_a["subjectTargets"] == {"math": 80.0}
    assert boot_a["scoreMaxima"]["regular"]["math"] == 120
    assert boot_b["target"] == 200
    assert boot_b["subjectTargets"] == {"math": 95.0}
    assert boot_b["scoreMaxima"]["regular"]["math"] == 90

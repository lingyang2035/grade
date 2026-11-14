from helpers import setup_admin


def test_demo_snapshot_is_consistent_and_read_only(client):
    setup_admin(client)
    boot = client.get("/api/bootstrap").get_json()
    demo = boot["demo"]
    assert len(demo["exams"]) == 5
    assert len(demo["evidence"]) == 7
    assert len(demo["tasks"]) == 4
    assert demo["target"] == 150
    assert demo["cohort"] == {"classCount": 42, "gradeCount": 420}
    assert boot["data"]["exams"] == []

    full_mocks = [exam for exam in demo["exams"] if exam["kind"] == "zhongkaoMock"]
    assert len(full_mocks) == 3
    for exam in full_mocks:
        assert exam["total"]["max"] == 750
        assert exam["total"]["partialMock"] is False
        assert exam["total"]["signature"]

    partials = [exam for exam in demo["exams"] if exam["kind"] == "stage"]
    assert len(partials) == 2
    for exam in partials:
        # 非模拟考试按已录科目求和；partialMock 只用于模拟中考缺科提示。
        assert exam["total"]["partialMock"] is False
        assert exam["total"]["signature"].startswith("custom|")
        expected_max = sum(entry["max"] for entry in exam["scores"].values())
        assert exam["total"]["max"] == expected_max

    # 客户端修改返回的演示对象，不影响下一次服务端快照。
    demo["exams"][0]["name"] = "被本地篡改"
    fresh = client.get("/api/bootstrap").get_json()["demo"]
    assert fresh["exams"][0]["name"] == "开学摸底"
    assert fresh["exams"][0]["total"]["score"] == 447


def test_demo_task_results_are_present(client):
    setup_admin(client)
    demo = client.get("/api/bootstrap").get_json()["demo"]
    tasks = {task["id"]: task for task in demo["tasks"]}
    assert tasks["demo-t1"]["result"] is None
    assert tasks["demo-t2"]["result"]["correct"] == 2
    assert tasks["demo-t3"]["result"]["questionSet"] == "original"

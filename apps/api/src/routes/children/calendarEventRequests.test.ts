import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import { createApp } from "../../app";
import { resetDb } from "../../testUtils/db";
import { signupTestUser, verifyInvitedTestUser } from "../../testUtils/auth";
import { withRls } from "../../lib/rls";

// Post-launch backlog Phase C proof — the request/approve workflow closing
// the Phase 3 scope cut (calendar_event:manage denies FAMILY/Caregiver
// outright; this is the "request" half of the §1.4 matrix that was flagged
// as a follow-up, never built until now).
describe("Calendar event requests (post-launch backlog Phase C)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("a FAMILY member can request a calendar event; a PARENT approving it creates the real event", async () => {
    const app = createApp();
    const { agent: parentAgent, userId: parentId } = await signupTestUser(app, { email: "cer-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const inviteRes = await parentAgent.post("/invites").send({ childId, relationship: "AUNT", email: "cer-aunt@example.com" });
    const auntAgent = request.agent(app);
    await auntAgent.post(`/invites/${inviteRes.body.token}/accept`).send({ firstName: "A", lastName: "Unt", password: "password123" });
    await verifyInvitedTestUser(auntAgent, "cer-aunt@example.com");

    const reqRes = await auntAgent.post(`/children/${childId}/calendar-event-requests`).send({
      categoryId: "cat_sport",
      title: "Soccer practice",
      startsAt: "2026-10-01T15:00:00.000Z",
    });
    expect(reqRes.status).toBe(201);
    expect(reqRes.body.status).toBe("PENDING");

    const beforeCount = await withRls(parentId, (tx) => tx.calendarEvent.count({ where: { childId } }));
    expect(beforeCount).toBe(0);

    const approveRes = await parentAgent
      .patch(`/children/${childId}/calendar-event-requests/${reqRes.body.id}`)
      .send({ status: "APPROVED" });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("APPROVED");

    const afterCount = await withRls(parentId, (tx) => tx.calendarEvent.count({ where: { childId, title: "Soccer practice" } }));
    expect(afterCount).toBe(1);
  });

  it("declining a request does not create a calendar event", async () => {
    const app = createApp();
    const { agent: parentAgent, userId: parentId } = await signupTestUser(app, { email: "cer-decline-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "GIRL", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const reqRes = await parentAgent.post(`/children/${childId}/calendar-event-requests`).send({
      categoryId: "cat_school",
      title: "Field trip",
      startsAt: "2026-11-01T09:00:00.000Z",
    });

    // A second parent declines it (a PARENT can also request, per the
    // matrix — only approving your own is blocked).
    const inviteRes = await parentAgent.post("/invites").send({ childId, relationship: "FATHER", email: "cer-dad@example.com" });
    const dadAgent = request.agent(app);
    await dadAgent.post(`/invites/${inviteRes.body.token}/accept`).send({ firstName: "D", lastName: "Ad", password: "password123" });
    await verifyInvitedTestUser(dadAgent, "cer-dad@example.com");

    const declineRes = await dadAgent
      .patch(`/children/${childId}/calendar-event-requests/${reqRes.body.id}`)
      .send({ status: "DECLINED" });
    expect(declineRes.status).toBe(200);

    const events = await withRls(parentId, (tx) => tx.calendarEvent.count({ where: { childId } }));
    expect(events).toBe(0);
  });

  it("a requester cannot approve their own request", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "cer-self-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const reqRes = await parentAgent.post(`/children/${childId}/calendar-event-requests`).send({
      categoryId: "cat_appointment",
      title: "Dentist",
      startsAt: "2026-10-15T10:00:00.000Z",
    });
    const selfApprove = await parentAgent
      .patch(`/children/${childId}/calendar-event-requests/${reqRes.body.id}`)
      .send({ status: "APPROVED" });
    expect(selfApprove.status).toBe(400);
  });

  it("a Caregiver cannot request a calendar event, but a plain FAMILY member can", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "cer-cg-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const cgInvite = await parentAgent.post("/invites").send({ childId, relationship: "CAREGIVER", email: "cer-caregiver@example.com" });
    const cgAgent = request.agent(app);
    await cgAgent.post(`/invites/${cgInvite.body.token}/accept`).send({ firstName: "C", lastName: "G", password: "password123" });
    await verifyInvitedTestUser(cgAgent, "cer-caregiver@example.com");

    const cgRes = await cgAgent.post(`/children/${childId}/calendar-event-requests`).send({
      categoryId: "cat_sport",
      title: "Playdate",
      startsAt: "2026-10-20T14:00:00.000Z",
    });
    expect(cgRes.status).toBe(403);

    const otherInvite = await parentAgent.post("/invites").send({ childId, relationship: "AUNT", email: "cer-plain-family@example.com" });
    const otherAgent = request.agent(app);
    await otherAgent.post(`/invites/${otherInvite.body.token}/accept`).send({ firstName: "P", lastName: "Family", password: "password123" });
    await verifyInvitedTestUser(otherAgent, "cer-plain-family@example.com");

    const okRes = await otherAgent.post(`/children/${childId}/calendar-event-requests`).send({
      categoryId: "cat_sport",
      title: "Playdate",
      startsAt: "2026-10-20T14:00:00.000Z",
    });
    expect(okRes.status).toBe(201);
  });

  it("a FAMILY member cannot approve a request", async () => {
    const app = createApp();
    const { agent: parentAgent } = await signupTestUser(app, { email: "cer-noapprove-parent@example.com" });
    const childRes = await parentAgent.post("/children").send({ firstName: "Kid", gender: "BOY", birthday: "2020-01-01" });
    const childId = childRes.body.id;

    const reqRes = await parentAgent.post(`/children/${childId}/calendar-event-requests`).send({
      categoryId: "cat_sport",
      title: "Art class",
      startsAt: "2026-10-05T13:00:00.000Z",
    });

    const auntInvite = await parentAgent.post("/invites").send({ childId, relationship: "AUNT", email: "cer-noapprove-aunt@example.com" });
    const auntAgent = request.agent(app);
    await auntAgent.post(`/invites/${auntInvite.body.token}/accept`).send({ firstName: "A", lastName: "Unt", password: "password123" });
    await verifyInvitedTestUser(auntAgent, "cer-noapprove-aunt@example.com");

    const approveRes = await auntAgent
      .patch(`/children/${childId}/calendar-event-requests/${reqRes.body.id}`)
      .send({ status: "APPROVED" });
    expect(approveRes.status).toBe(403);
  });
});

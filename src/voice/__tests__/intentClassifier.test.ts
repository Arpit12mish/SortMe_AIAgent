import { classifyVoiceCapture } from '../intentClassifier';

describe('classifyVoiceCapture', () => {
  it('routes an urgent same-day task to urgent_task with a same-day deadline hint', () => {
    const r = classifyVoiceCapture('I urgently need to finish the client report today');
    expect(r.destination).toBe('urgent_task');
    expect(r.deadlineOffsetDays).toBe(0);
    expect(r.titleGuess.toLowerCase()).toContain('finish the client report');
  });

  it('routes a non-urgent task with a tomorrow deadline to task', () => {
    const r = classifyVoiceCapture('I need to submit the design mockups tomorrow');
    expect(r.destination).toBe('task');
    expect(r.deadlineOffsetDays).toBe(1);
  });

  it('routes interview talk to interview', () => {
    const r = classifyVoiceCapture('My interview with Acme Corp went really well, they asked about my React experience');
    expect(r.destination).toBe('interview');
  });

  it('routes mood/venting to mood', () => {
    const r = classifyVoiceCapture("I'm feeling pretty overwhelmed today, I have way too much on my plate");
    expect(r.destination).toBe('mood');
  });

  it('routes a quiz request to quiz', () => {
    const r = classifyVoiceCapture('Give me my daily quiz, five questions please');
    expect(r.destination).toBe('quiz');
  });

  it('routes notes revision talk to note', () => {
    const r = classifyVoiceCapture('I need to do notes revision on the system design topic');
    expect(r.destination).toBe('note');
  });

  it('falls back to note when nothing matches, never throwing on empty input', () => {
    const r = classifyVoiceCapture('');
    expect(r.destination).toBe('note');
    expect(r.deadlineOffsetDays).toBeNull();
  });

  it('strips filler prefixes and caps an overlong title', () => {
    const r = classifyVoiceCapture(
      'um so I need to ' + 'reorganize the entire quarterly budget spreadsheet before the finance review meeting next week'
    );
    expect(r.titleGuess.startsWith('Um')).toBe(false);
    expect(r.titleGuess.length).toBeLessThanOrEqual(58);
  });

  it('prefers urgent_task when urgency words are present even without a deadline word', () => {
    const r = classifyVoiceCapture('This is urgent, I need to call the landlord about the leak');
    expect(r.destination).toBe('urgent_task');
  });
});

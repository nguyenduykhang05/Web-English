import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

interface WordSeedSpec {
  deckSlug: string;
  term: string;
  meaningVi: string;
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  fallbackIpa: string;
  fallbackPos: string;
  fallbackDef: string;
  fallbackExample: string;
  contextNote?: string;
}

interface DeckSpec {
  slug: string;
  title: string;
  titleVi: string;
  description: string;
  category: 'cefr' | 'ielts' | 'business' | 'communication';
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  goalType: 'ielts' | 'toeic' | 'communication' | 'business';
  sourceName: string;
  sourceUrl: string;
}

const DECK_SPECS: DeckSpec[] = [
  {
    slug: 'ngsl-core-a1-a2',
    title: 'Everyday Core Foundation (A1–A2)',
    titleVi: 'Từ vựng Nền tảng Giao tiếp Hàng ngày (A1–A2)',
    description:
      'Những từ tần suất cao nhất theo chuẩn New General Service List (NGSL) cho giao tiếp đời sống, kèm phát âm IPA và audio Wikimedia.',
    category: 'cefr',
    cefrLevel: 'A2',
    goalType: 'communication',
    sourceName: 'NGSL + Free Dictionary API (CC-BY-SA)',
    sourceUrl: 'https://www.newgeneralservicelist.org/',
  },
  {
    slug: 'cefr-b1-workplace-fluency',
    title: 'Workplace & Social Interaction (B1)',
    titleVi: 'Giao tiếp Công sở & Tương tác Xã hội (B1)',
    description:
      'Từ vựng chủ đề điểm mạnh, giải quyết vấn đề, lịch hẹn và phản hồi tự nhiên tại nơi làm việc.',
    category: 'cefr',
    cefrLevel: 'B1',
    goalType: 'communication',
    sourceName: 'NGSL + Free Dictionary API (CC-BY-SA)',
    sourceUrl: 'https://dictionaryapi.dev/',
  },
  {
    slug: 'ielts-academic-urban-env',
    title: 'IELTS Band 7.0+ Academic & Environment',
    titleVi: 'Từ vựng Học thuật IELTS: Đô thị & Môi trường (B2–C1)',
    description:
      'Tuyển chọn từ vựng học thuật AWL/NAWL thường dùng trong IELTS Speaking Part 3 và Writing Task 2.',
    category: 'ielts',
    cefrLevel: 'B2',
    goalType: 'ielts',
    sourceName: 'Academic Word List + Free Dictionary API',
    sourceUrl: 'https://dictionaryapi.dev/',
  },
  {
    slug: 'business-meetings-negotiation',
    title: 'Business Meetings & Stakeholder Alignment',
    titleVi: 'Tiếng Anh Họp Nhóm, Đàm phán & Agile (B2)',
    description:
      'Thuật ngữ và động từ mạnh phục vụ họp stand-up, thuyết trình, thương lượng deadline và báo cáo.',
    category: 'business',
    cefrLevel: 'B2',
    goalType: 'business',
    sourceName: 'Business Service List + Free Dictionary API',
    sourceUrl: 'https://dictionaryapi.dev/',
  },
];

const WORD_SPECS: WordSeedSpec[] = [
  // Deck 1: ngsl-core-a1-a2
  {
    deckSlug: 'ngsl-core-a1-a2',
    term: 'schedule',
    meaningVi: 'lịch trình, thời gian biểu',
    cefrLevel: 'A2',
    fallbackIpa: '/ˈskedʒ.uːl/',
    fallbackPos: 'noun',
    fallbackDef: 'A plan for carrying out a process or procedure, giving lists of intended events and times.',
    fallbackExample: 'Let me check my schedule before confirming our next lesson.',
  },
  {
    deckSlug: 'ngsl-core-a1-a2',
    term: 'improve',
    meaningVi: 'cải thiện, tiến bộ',
    cefrLevel: 'A2',
    fallbackIpa: '/ɪmˈpruːv/',
    fallbackPos: 'verb',
    fallbackDef: 'To make or become better.',
    fallbackExample: 'Daily shadowing helps improve your pronunciation quickly.',
  },
  {
    deckSlug: 'ngsl-core-a1-a2',
    term: 'habit',
    meaningVi: 'thói quen',
    cefrLevel: 'A2',
    fallbackIpa: '/ˈhæb.ɪt/',
    fallbackPos: 'noun',
    fallbackDef: 'A settled or regular tendency or practice, especially one that is hard to give up.',
    fallbackExample: 'Reviewing flashcards for ten minutes a day is a great study habit.',
  },
  {
    deckSlug: 'ngsl-core-a1-a2',
    term: 'explain',
    meaningVi: 'giải thích',
    cefrLevel: 'A2',
    fallbackIpa: '/ɪkˈspleɪn/',
    fallbackPos: 'verb',
    fallbackDef: 'To make an idea or situation clear to someone by describing it in more detail.',
    fallbackExample: 'Could you explain the difference between these two tenses?',
  },
  {
    deckSlug: 'ngsl-core-a1-a2',
    term: 'confident',
    meaningVi: 'tự tin',
    cefrLevel: 'A2',
    fallbackIpa: '/ˈkɒn.fɪ.dənt/',
    fallbackPos: 'adjective',
    fallbackDef: 'Feeling or showing certainty about something or about one’s abilities.',
    fallbackExample: 'She feels much more confident speaking English during team calls.',
  },
  {
    deckSlug: 'ngsl-core-a1-a2',
    term: 'recommend',
    meaningVi: 'gợi ý, đề xuất',
    cefrLevel: 'A2',
    fallbackIpa: '/ˌrek.əˈmend/',
    fallbackPos: 'verb',
    fallbackDef: 'To put forward someone or something with approval as being suitable for a purpose.',
    fallbackExample: 'Which podcast would you recommend for B1 listening practice?',
  },
  {
    deckSlug: 'ngsl-core-a1-a2',
    term: 'appointment',
    meaningVi: 'cuộc hẹn',
    cefrLevel: 'A2',
    fallbackIpa: '/əˈpɔɪnt.mənt/',
    fallbackPos: 'noun',
    fallbackDef: 'An arrangement to meet someone at a particular time and place.',
    fallbackExample: 'I booked an online appointment with my coach for Friday evening.',
  },
  {
    deckSlug: 'ngsl-core-a1-a2',
    term: 'available',
    meaningVi: 'có sẵn, rảnh (lịch)',
    cefrLevel: 'A2',
    fallbackIpa: '/əˈveɪ.lə.bəl/',
    fallbackPos: 'adjective',
    fallbackDef: 'Able to be used or obtained; free to do something.',
    fallbackExample: 'Are you available at 7:30 PM ICT tomorrow?',
  },
  {
    deckSlug: 'ngsl-core-a1-a2',
    term: 'feedback',
    meaningVi: 'phản hồi, nhận xét',
    cefrLevel: 'B1',
    fallbackIpa: '/ˈfiːd.bæk/',
    fallbackPos: 'noun',
    fallbackDef: 'Information about reactions to a product or a person’s performance used as a basis for improvement.',
    fallbackExample: 'Teacher feedback after every session keeps my learning on track.',
  },
  {
    deckSlug: 'ngsl-core-a1-a2',
    term: 'fluent',
    meaningVi: 'trôi chảy, lưu loát',
    cefrLevel: 'B1',
    fallbackIpa: '/ˈfluː.ənt/',
    fallbackPos: 'adjective',
    fallbackDef: 'Able to express oneself easily and articulately.',
    fallbackExample: 'He became fluent after six months of consistent 1-on-1 practice.',
  },

  // Deck 2: cefr-b1-workplace-fluency
  {
    deckSlug: 'cefr-b1-workplace-fluency',
    term: 'collaborate',
    meaningVi: 'cộng tác, phối hợp làm việc',
    cefrLevel: 'B1',
    fallbackIpa: '/kəˈlæb.ə.reɪt/',
    fallbackPos: 'verb',
    fallbackDef: 'To work jointly on an activity or project.',
    fallbackExample: 'Designers and engineers collaborate closely during product sprints.',
  },
  {
    deckSlug: 'cefr-b1-workplace-fluency',
    term: 'deadline',
    meaningVi: 'hạn chót hoàn thành',
    cefrLevel: 'B1',
    fallbackIpa: '/ˈded.laɪn/',
    fallbackPos: 'noun',
    fallbackDef: 'The latest time or date by which something should be completed.',
    fallbackExample: 'We need to meet the Friday deadline without sacrificing quality.',
  },
  {
    deckSlug: 'cefr-b1-workplace-fluency',
    term: 'clarify',
    meaningVi: 'làm rõ (ý kiến, yêu cầu)',
    cefrLevel: 'B1',
    fallbackIpa: '/ˈklær.ɪ.faɪ/',
    fallbackPos: 'verb',
    fallbackDef: 'To make a statement or situation less confused and more comprehensible.',
    fallbackExample: 'Could you clarify what the client expects in the second milestone?',
  },
  {
    deckSlug: 'cefr-b1-workplace-fluency',
    term: 'priority',
    meaningVi: 'sự ưu tiên, việc ưu tiên hàng đầu',
    cefrLevel: 'B1',
    fallbackIpa: '/praɪˈɒr.ə.ti/',
    fallbackPos: 'noun',
    fallbackDef: 'The fact or condition of being regarded or treated as more important than others.',
    fallbackExample: 'Fixing pronunciation of final consonants is our top priority this month.',
  },
  {
    deckSlug: 'cefr-b1-workplace-fluency',
    term: 'convinced',
    meaningVi: 'bị thuyết phục, tin chắc',
    cefrLevel: 'B1',
    fallbackIpa: '/kənˈvɪnst/',
    fallbackPos: 'adjective',
    fallbackDef: 'Completely certain about something.',
    fallbackExample: 'I am not convinced that this layout fits the client brief.',
    contextNote: 'Xuất hiện trong bài British Council: Agreeing and disagreeing',
  },
  {
    deckSlug: 'cefr-b1-workplace-fluency',
    term: 'balance',
    meaningVi: 'sự cân bằng',
    cefrLevel: 'B1',
    fallbackIpa: '/ˈbæl.əns/',
    fallbackPos: 'noun',
    fallbackDef: 'An even distribution of weight or elements enabling someone or something to remain steady.',
    fallbackExample: 'Removing the bright border creates a nice visual balance.',
  },
  {
    deckSlug: 'cefr-b1-workplace-fluency',
    term: 'extension',
    meaningVi: 'sự gia hạn thêm thời gian',
    cefrLevel: 'B1',
    fallbackIpa: '/ɪkˈsten.ʃən/',
    fallbackPos: 'noun',
    fallbackDef: 'An extra period of time allowed for something, such as a deadline or payment.',
    fallbackExample: 'Andrea called to ask for a payment extension from 30 to 60 days.',
    contextNote: 'Xuất hiện trong bài British Council: A phone call from a customer',
  },
  {
    deckSlug: 'cefr-b1-workplace-fluency',
    term: 'compromise',
    meaningVi: 'sự thỏa hiệp, phương án dung hòa',
    cefrLevel: 'B2',
    fallbackIpa: '/ˈkɒm.prə.maɪz/',
    fallbackPos: 'noun',
    fallbackDef: 'An agreement or settlement of a dispute reached by each side making concessions.',
    fallbackExample: 'Both teams reached a fair compromise on the launch scope.',
  },
  {
    deckSlug: 'cefr-b1-workplace-fluency',
    term: 'efficient',
    meaningVi: 'hiệu quả, tối ưu thời gian/nguồn lực',
    cefrLevel: 'B1',
    fallbackIpa: '/ɪˈfɪʃ.ənt/',
    fallbackPos: 'adjective',
    fallbackDef: 'Achieving maximum productivity with minimum wasted effort or expense.',
    fallbackExample: 'Spaced repetition is an efficient way to retain new vocabulary.',
  },
  {
    deckSlug: 'cefr-b1-workplace-fluency',
    term: 'negotiate',
    meaningVi: 'đàm phán, thương lượng',
    cefrLevel: 'B2',
    fallbackIpa: '/nɪˈɡəʊ.ʃi.eɪt/',
    fallbackPos: 'verb',
    fallbackDef: 'To try to reach an agreement or compromise by discussion.',
    fallbackExample: 'We need to negotiate flexible delivery milestones with the partner.',
  },

  // Deck 3: ielts-academic-urban-env
  {
    deckSlug: 'ielts-academic-urban-env',
    term: 'mitigate',
    meaningVi: 'giảm thiểu, làm dịu bớt (tác động xấu)',
    cefrLevel: 'C1',
    fallbackIpa: '/ˈmɪt.ɪ.ɡeɪt/',
    fallbackPos: 'verb',
    fallbackDef: 'To make less severe, serious, or painful.',
    fallbackExample: 'Expanding metro lines can significantly mitigate urban traffic congestion.',
    contextNote: 'Nâng cấp từ "solve/reduce" lên Band 7.5+',
  },
  {
    deckSlug: 'ielts-academic-urban-env',
    term: 'sustainable',
    meaningVi: 'bền vững, thân thiện dài hạn',
    cefrLevel: 'B2',
    fallbackIpa: '/səˈsteɪ.nə.bəl/',
    fallbackPos: 'adjective',
    fallbackDef: 'Able to be maintained at a certain rate or level without depleting resources.',
    fallbackExample: 'Cities must invest in sustainable public infrastructure.',
  },
  {
    deckSlug: 'ielts-academic-urban-env',
    term: 'infrastructure',
    meaningVi: 'cơ sở hạ tầng',
    cefrLevel: 'B2',
    fallbackIpa: '/ˈɪn.frə.strʌk.tʃər/',
    fallbackPos: 'noun',
    fallbackDef: 'The basic physical and organizational structures needed for the operation of a society.',
    fallbackExample: 'Reliable transit infrastructure encourages commuters to leave cars at home.',
  },
  {
    deckSlug: 'ielts-academic-urban-env',
    term: 'congestion',
    meaningVi: 'sự ùn tắc (giao thông)',
    cefrLevel: 'B2',
    fallbackIpa: '/kənˈdʒes.tʃən/',
    fallbackPos: 'noun',
    fallbackDef: 'The state of being overcrowded, especially with traffic.',
    fallbackExample: 'Peak-hour congestion lowers productivity across major metropolitan areas.',
  },
  {
    deckSlug: 'ielts-academic-urban-env',
    term: 'exacerbate',
    meaningVi: 'làm trầm trọng thêm',
    cefrLevel: 'C1',
    fallbackIpa: '/ɪɡˈzæs.ə.beɪt/',
    fallbackPos: 'verb',
    fallbackDef: 'To make a problem, bad situation, or negative feeling worse.',
    fallbackExample: 'Unregulated urban sprawl can exacerbate air pollution.',
  },
  {
    deckSlug: 'ielts-academic-urban-env',
    term: 'incentive',
    meaningVi: 'động lực, chính sách khuyến khích',
    cefrLevel: 'B2',
    fallbackIpa: '/ɪnˈsen.tɪv/',
    fallbackPos: 'noun',
    fallbackDef: 'A thing that motivates or encourages someone to do something.',
    fallbackExample: 'Tax incentives motivate companies to adopt renewable energy.',
  },
  {
    deckSlug: 'ielts-academic-urban-env',
    term: 'disparity',
    meaningVi: 'sự chênh lệch, bất bình đẳng',
    cefrLevel: 'C1',
    fallbackIpa: '/dɪˈspær.ə.ti/',
    fallbackPos: 'noun',
    fallbackDef: 'A great difference, especially one perceived as unfair.',
    fallbackExample: 'There is a widening disparity between urban and rural healthcare access.',
  },
  {
    deckSlug: 'ielts-academic-urban-env',
    term: 'resilient',
    meaningVi: 'kiên cường, thích ứng phục hồi nhanh',
    cefrLevel: 'C1',
    fallbackIpa: '/rɪˈzɪl.i.ənt/',
    fallbackPos: 'adjective',
    fallbackDef: 'Able to withstand or recover quickly from difficult conditions.',
    fallbackExample: 'Coastal cities need resilient drainage systems against extreme weather.',
  },
  {
    deckSlug: 'ielts-academic-urban-env',
    term: 'inevitable',
    meaningVi: 'không thể tránh khỏi',
    cefrLevel: 'B2',
    fallbackIpa: '/ɪˈnev.ɪ.tə.bəl/',
    fallbackPos: 'adjective',
    fallbackDef: 'Certain to happen; unavoidable.',
    fallbackExample: 'Automation is an inevitable trend in modern manufacturing.',
  },
  {
    deckSlug: 'ielts-academic-urban-env',
    term: 'allocate',
    meaningVi: 'phân bổ (ngân sách, nguồn lực)',
    cefrLevel: 'B2',
    fallbackIpa: '/ˈæl.ə.keɪt/',
    fallbackPos: 'verb',
    fallbackDef: 'To distribute resources or duties for a particular purpose.',
    fallbackExample: 'Municipalities should allocate more funding to green spaces.',
  },

  // Deck 4: business-meetings-negotiation
  {
    deckSlug: 'business-meetings-negotiation',
    term: 'alignment',
    meaningVi: 'sự đồng thuận, thống nhất hướng đi',
    cefrLevel: 'B2',
    fallbackIpa: '/əˈlaɪn.mənt/',
    fallbackPos: 'noun',
    fallbackDef: 'Arrangement in a straight line or agreement among stakeholders on shared goals.',
    fallbackExample: 'Let us schedule a 15-minute sync to ensure stakeholder alignment.',
  },
  {
    deckSlug: 'business-meetings-negotiation',
    term: 'feasible',
    meaningVi: 'khả thi (thực hiện được)',
    cefrLevel: 'B2',
    fallbackIpa: '/ˈfiː.zə.bəl/',
    fallbackPos: 'adjective',
    fallbackDef: 'Possible to do easily or conveniently.',
    fallbackExample: 'Shipping all five features this quarter does not look feasible.',
  },
  {
    deckSlug: 'business-meetings-negotiation',
    term: 'bottleneck',
    meaningVi: 'điểm nghẽn (trong quy trình)',
    cefrLevel: 'B2',
    fallbackIpa: '/ˈbɒt.əl.nek/',
    fallbackPos: 'noun',
    fallbackDef: 'A point of congestion in a production system that slows down the whole process.',
    fallbackExample: 'Manual QA testing became a major bottleneck before launch.',
  },
  {
    deckSlug: 'business-meetings-negotiation',
    term: 'delegate',
    meaningVi: 'ủy quyền, phân công đầu việc',
    cefrLevel: 'B2',
    fallbackIpa: '/ˈdel.ɪ.ɡeɪt/',
    fallbackPos: 'verb',
    fallbackDef: 'To entrust a task or responsibility to another person.',
    fallbackExample: 'Effective managers know when to delegate routine reporting.',
  },
  {
    deckSlug: 'business-meetings-negotiation',
    term: 'benchmark',
    meaningVi: 'chuẩn đối chiếu, thước đo chuẩn',
    cefrLevel: 'B2',
    fallbackIpa: '/ˈbentʃ.mɑːk/',
    fallbackPos: 'noun',
    fallbackDef: 'A standard or point of reference against which things may be compared.',
    fallbackExample: 'We use CEFR B2 fluency as a benchmark for client-facing roles.',
  },
  {
    deckSlug: 'business-meetings-negotiation',
    term: 'leverage',
    meaningVi: 'tận dụng đòn bẩy, khai thác lợi thế',
    cefrLevel: 'C1',
    fallbackIpa: '/ˈlev.ər.ɪdʒ/',
    fallbackPos: 'verb',
    fallbackDef: 'To use something to maximum advantage.',
    fallbackExample: 'Teams can leverage AI summaries while keeping human review final.',
  },
  {
    deckSlug: 'business-meetings-negotiation',
    term: 'consensus',
    meaningVi: 'sự nhất trí chung của tập thể',
    cefrLevel: 'C1',
    fallbackIpa: '/kənˈsen.səs/',
    fallbackPos: 'noun',
    fallbackDef: 'A general agreement among a group of people.',
    fallbackExample: 'After a candid debate, the committee reached a consensus.',
  },
  {
    deckSlug: 'business-meetings-negotiation',
    term: 'agile',
    meaningVi: 'linh hoạt, thích ứng nhanh',
    cefrLevel: 'B2',
    fallbackIpa: '/ˈædʒ.aɪl/',
    fallbackPos: 'adjective',
    fallbackDef: 'Able to move quickly and easily; adaptable to rapid change.',
    fallbackExample: 'Agile working lets teams adjust priorities based on real user feedback.',
    contextNote: 'Xuất hiện trong bài British Council: Agile working',
  },
  {
    deckSlug: 'business-meetings-negotiation',
    term: 'implement',
    meaningVi: 'triển khai, thực thi',
    cefrLevel: 'B2',
    fallbackIpa: '/ˈɪm.plɪ.ment/',
    fallbackPos: 'verb',
    fallbackDef: 'To put a decision, plan, or agreement into effect.',
    fallbackExample: 'We plan to implement the new onboarding flow next Monday.',
  },
  {
    deckSlug: 'business-meetings-negotiation',
    term: 'concise',
    meaningVi: 'ngắn gọn, súc tích',
    cefrLevel: 'B2',
    fallbackIpa: '/kənˈsaɪs/',
    fallbackPos: 'adjective',
    fallbackDef: 'Giving a lot of information clearly and in a few words.',
    fallbackExample: 'Executive updates should be concise and backed by clear metrics.',
  },
];

async function enrichWord(spec: WordSeedSpec) {
  let ipa = spec.fallbackIpa;
  let partOfSpeech = spec.fallbackPos;
  let definitionEn = spec.fallbackDef;
  let exampleEn = spec.fallbackExample;
  let audioUrl: string | undefined;

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(spec.term)}`);
    if (res.ok) {
      const json = (await res.json()) as Array<{
        phonetic?: string;
        phonetics?: Array<{ text?: string; audio?: string }>;
        meanings?: Array<{
          partOfSpeech?: string;
          definitions?: Array<{ definition?: string; example?: string }>;
        }>;
      }>;
      const first = json[0];
      if (first) {
        const phoneticWithText = first.phonetics?.find((p) => p.text && p.text.trim().length > 0);
        const phoneticWithAudio =
          first.phonetics?.find((p) => p.audio && p.audio.includes('-us.mp3')) ??
          first.phonetics?.find((p) => p.audio && p.audio.trim().length > 0);
        if (first.phonetic) ipa = first.phonetic;
        else if (phoneticWithText?.text) ipa = phoneticWithText.text;

        if (phoneticWithAudio?.audio) {
          audioUrl = phoneticWithAudio.audio;
        }

        const firstMeaning = first.meanings?.[0];
        if (firstMeaning?.partOfSpeech) {
          partOfSpeech = firstMeaning.partOfSpeech;
        }
        const firstDef = firstMeaning?.definitions?.[0];
        if (firstDef?.definition) {
          definitionEn = firstDef.definition;
        }
        if (firstDef?.example) {
          exampleEn = firstDef.example;
        }
      }
    }
  } catch {
    // Fallback offline values are kept cleanly
  }

  return {
    deckSlug: spec.deckSlug,
    term: spec.term,
    ipa,
    partOfSpeech,
    meaningVi: spec.meaningVi,
    definitionEn,
    exampleEn,
    audioUrl,
    contextNote: spec.contextNote,
    cefrLevel: spec.cefrLevel,
  };
}

function buildIpaChartData() {
  // Complete 44 standard English IPA symbols (12 monophthongs, 8 diphthongs, 24 consonants)
  return [
    // 12 Monophthongs
    {
      number: 1,
      symbol: 'iː',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm i dài (căng)',
      articulationTipVi: 'Kéo nhẹ khóe miệng sang hai bên như mỉm cười, nâng lưỡi cao về phía trước và kéo dài hơi.',
      vietnamesePitfallVi: 'Người Việt hay đọc ngắn bằng /ɪ/, làm nhầm "sheep" thành "ship" hoặc "leave" thành "live".',
      spellingPatterns: ['ee (see)', 'ea (eat)', 'ie (field)', 'e (be)'],
      confusingPairSymbol: 'ɪ',
      examples: [
        { word: 'sheep', highlightPart: 'ee', ipa: '/ʃiːp/', meaningVi: 'con cừu' },
        { word: 'speak', highlightPart: 'ea', ipa: '/spiːk/', meaningVi: 'nói' },
        { word: 'believe', highlightPart: 'ie', ipa: '/bɪˈliːv/', meaningVi: 'tin tưởng' },
      ],
      sampleSentence: {
        textEn: 'We need to speak clearly during every weekly meeting.',
        textVi: 'Chúng ta cần nói rõ ràng trong mỗi cuộc họp hằng tuần.',
        targetWord: 'speak',
      },
    },
    {
      number: 2,
      symbol: 'ɪ',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm i ngắn (thả lỏng)',
      articulationTipVi: 'Thả lỏng môi và lưỡi, mở miệng tự nhiên hơi thấp hơn âm i tiếng Việt, phát âm dứt khoát ngắn.',
      vietnamesePitfallVi: 'Hay đọc quá căng thành /iː/, khiến "sit" nghe giống "seat" hoặc "live" giống "leave".',
      spellingPatterns: ['i (sit)', 'y (system)', 'ui (build)', 'e (pretty)'],
      confusingPairSymbol: 'iː',
      examples: [
        { word: 'ship', highlightPart: 'i', ipa: '/ʃɪp/', meaningVi: 'con tàu' },
        { word: 'system', highlightPart: 'y', ipa: '/ˈsɪs.təm/', meaningVi: 'hệ thống' },
        { word: 'build', highlightPart: 'ui', ipa: '/bɪld/', meaningVi: 'xây dựng' },
      ],
      sampleSentence: {
        textEn: 'This simple habit builds confidence bit by bit.',
        textVi: 'Thói quen đơn giản này xây dựng sự tự tin từng chút một.',
        targetWord: 'simple',
      },
    },
    {
      number: 3,
      symbol: 'ʊ',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm u ngắn (thả lỏng)',
      articulationTipVi: 'Môi hơi tròn nhẹ và thả lỏng hoàn toàn, âm thanh phát ra ngắn giữa "u" và "ơ".',
      vietnamesePitfallVi: 'Hay chu môi quá mạnh thành /uː/, làm "good" hay "book" nghe nặng nề.',
      spellingPatterns: ['oo (book)', 'u (put)', 'oul (could)'],
      confusingPairSymbol: 'uː',
      examples: [
        { word: 'book', highlightPart: 'oo', ipa: '/bʊk/', meaningVi: 'quyển sách' },
        { word: 'put', highlightPart: 'u', ipa: '/pʊt/', meaningVi: 'đặt, để' },
        { word: 'could', highlightPart: 'oul', ipa: '/kʊd/', meaningVi: 'có thể' },
      ],
      sampleSentence: {
        textEn: 'You should look at this good notebook before class.',
        textVi: 'Bạn nên xem qua quyển sổ ghi chú hay này trước giờ học.',
        targetWord: 'good',
      },
    },
    {
      number: 4,
      symbol: 'uː',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm u dài (tròn môi)',
      articulationTipVi: 'Chu tròn môi rõ ràng, nâng cuống lưỡi cao phía sau và kéo dài hơi.',
      vietnamesePitfallVi: 'Thiếu độ dài hoặc thiếu âm lướt /juː/ ở các từ như "student", "schedule".',
      spellingPatterns: ['oo (food)', 'u (rule)', 'ew (new)', 'ue (true)'],
      confusingPairSymbol: 'ʊ',
      examples: [
        { word: 'food', highlightPart: 'oo', ipa: '/fuːd/', meaningVi: 'thức ăn' },
        { word: 'improve', highlightPart: 'o', ipa: '/ɪmˈpruːv/', meaningVi: 'cải thiện' },
        { word: 'true', highlightPart: 'ue', ipa: '/truː/', meaningVi: 'đúng sự thật' },
      ],
      sampleSentence: {
        textEn: 'Two students chose the afternoon fluency room.',
        textVi: 'Hai học viên đã chọn phòng luyện độ trôi chảy buổi chiều.',
        targetWord: 'room',
      },
    },
    {
      number: 5,
      symbol: 'e',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm e ngắn',
      articulationTipVi: 'Mở miệng vừa phải hơn /ɪ/, đầu lưỡi chạm nhẹ răng cửa dưới, phát âm gọn.',
      vietnamesePitfallVi: 'Thường nhầm với /æ/ khiến "men" nghe như "man" hoặc "bed" như "bad".',
      spellingPatterns: ['e (bed)', 'ea (head)', 'ai (said)'],
      confusingPairSymbol: 'æ',
      examples: [
        { word: 'check', highlightPart: 'e', ipa: '/tʃek/', meaningVi: 'kiểm tra' },
        { word: 'deadline', highlightPart: 'ea', ipa: '/ˈded.laɪn/', meaningVi: 'hạn chót' },
        { word: 'session', highlightPart: 'e', ipa: '/ˈseʃ.ən/', meaningVi: 'buổi học' },
      ],
      sampleSentence: {
        textEn: 'Remember to check every sentence before the deadline.',
        textVi: 'Hãy nhớ kiểm tra từng câu trước hạn chót.',
        targetWord: 'check',
      },
    },
    {
      number: 6,
      symbol: 'ə',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm ơ ngắn (Schwa — âm không nhấn)',
      articulationTipVi: 'Thả lỏng toàn bộ hàm, lưỡi và môi; phát âm cực nhẹ và nhanh ở các âm tiết không nhận trọng âm.',
      vietnamesePitfallVi: 'Người Việt hay đọc rõ từng nguyên âm theo mặt chữ (như "about" đọc thành "a-bao") khiến câu mất nhịp tự nhiên.',
      spellingPatterns: ['a (about)', 'e (teacher)', 'o (today)', 'u (support)'],
      confusingPairSymbol: 'ɜː',
      examples: [
        { word: 'about', highlightPart: 'a', ipa: '/əˈbaʊt/', meaningVi: 'về, khoảng' },
        { word: 'teacher', highlightPart: 'er', ipa: '/ˈtiː.tʃər/', meaningVi: 'giáo viên' },
        { word: 'support', highlightPart: 'u', ipa: '/səˈpɔːt/', meaningVi: 'hỗ trợ' },
      ],
      sampleSentence: {
        textEn: 'A teacher can support a learner at any level.',
        textVi: 'Giáo viên có thể hỗ trợ người học ở mọi trình độ.',
        targetWord: 'support',
      },
    },
    {
      number: 7,
      symbol: 'ɜː',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm ơ dài (có nhấn trọng âm)',
      articulationTipVi: 'Giữ lưỡi ở giữa khoang miệng, hơi cong nhẹ đầu lưỡi (nếu đọc giọng Mỹ /ɜːr/), kéo dài hơi.',
      vietnamesePitfallVi: 'Hay đọc thành âm "ơ" ngắn hoặc âm "ư" tiếng Việt trong các từ "work", "word", "learn".',
      spellingPatterns: ['ir (bird)', 'er (person)', 'ur (turn)', 'ear (learn)'],
      confusingPairSymbol: 'ə',
      examples: [
        { word: 'learn', highlightPart: 'ear', ipa: '/lɜːn/', meaningVi: 'học' },
        { word: 'work', highlightPart: 'or', ipa: '/wɜːk/', meaningVi: 'làm việc' },
        { word: 'first', highlightPart: 'ir', ipa: '/fɜːst/', meaningVi: 'đầu tiên' },
      ],
      sampleSentence: {
        textEn: 'Her first goal is to learn thirty verbs at work.',
        textVi: 'Mục tiêu đầu tiên của cô ấy là học ba mươi động từ tại chỗ làm.',
        targetWord: 'learn',
      },
    },
    {
      number: 8,
      symbol: 'ɔː',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm o dài',
      articulationTipVi: 'Tròn môi vừa, hạ hàm vừa phải, cuống lưỡi lùi nhẹ về sau và kéo dài âm.',
      vietnamesePitfallVi: 'Hay bị thiếu âm cuối hoặc nhầm lẫn với /ɑː/ trong "walk" vs "work".',
      spellingPatterns: ['or (more)', 'aw (saw)', 'au (because)', 'al (talk)'],
      confusingPairSymbol: 'ɒ',
      examples: [
        { word: 'talk', highlightPart: 'al', ipa: '/tɔːk/', meaningVi: 'trò chuyện' },
        { word: 'course', highlightPart: 'our', ipa: '/kɔːs/', meaningVi: 'khóa học' },
        { word: 'morning', highlightPart: 'or', ipa: '/ˈmɔː.nɪŋ/', meaningVi: 'buổi sáng' },
      ],
      sampleSentence: {
        textEn: 'Let us talk more about your morning course tomorrow.',
        textVi: 'Hãy trao đổi thêm về khóa học buổi sáng của bạn vào ngày mai.',
        targetWord: 'course',
      },
    },
    {
      number: 9,
      symbol: 'æ',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm a bẹt (nửa a nửa e)',
      articulationTipVi: 'Hạ hàm sâu như phát âm "a", đồng thời kéo nhẹ khóe miệng sang ngang như "e".',
      vietnamesePitfallVi: 'Hay đọc thuần thành /e/ hoặc /a/, làm mất phân biệt "bad" vs "bed", "plan" vs "pen".',
      spellingPatterns: ['a (cat, plan, habit, clarify)'],
      confusingPairSymbol: 'e',
      examples: [
        { word: 'plan', highlightPart: 'a', ipa: '/plæn/', meaningVi: 'kế hoạch' },
        { word: 'habit', highlightPart: 'a', ipa: '/ˈhæb.ɪt/', meaningVi: 'thói quen' },
        { word: 'practice', highlightPart: 'a', ipa: '/ˈpræk.tɪs/', meaningVi: 'luyện tập' },
      ],
      sampleSentence: {
        textEn: 'Active practice every day makes a bad habit disappear.',
        textVi: 'Luyện tập chủ động mỗi ngày giúp xóa bỏ thói quen xấu.',
        targetWord: 'practice',
      },
    },
    {
      number: 10,
      symbol: 'ʌ',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm á ngắn (ngắn, mở giữa)',
      articulationTipVi: 'Mở miệng tự nhiên, lưỡi thả thấp giữa khoang miệng, bật âm "ă" ngắn gọn.',
      vietnamesePitfallVi: 'Hay đọc thành âm "u" hoặc "ô" theo mặt chữ trong từ "study", "lunch", "company".',
      spellingPatterns: ['u (study)', 'o (love)', 'ou (enough)'],
      confusingPairSymbol: 'ɑː',
      examples: [
        { word: 'study', highlightPart: 'u', ipa: '/ˈstʌd.i/', meaningVi: 'học tập' },
        { word: 'trust', highlightPart: 'u', ipa: '/trʌst/', meaningVi: 'lòng tin' },
        { word: 'month', highlightPart: 'o', ipa: '/mʌnθ/', meaningVi: 'tháng' },
      ],
      sampleSentence: {
        textEn: 'We built strong trust during one month of study.',
        textVi: 'Chúng tôi đã xây dựng sự tin tưởng vững chắc trong một tháng học.',
        targetWord: 'study',
      },
    },
    {
      number: 11,
      symbol: 'ɑː',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm a dài (mở rộng)',
      articulationTipVi: 'Hạ hàm sâu, mở rộng khoang họng, giữ lưỡi thấp và kéo dài âm "a".',
      vietnamesePitfallVi: 'Thiếu độ mở họng hoặc nuốt âm /r/ (giọng Mỹ) trong "start", "smart", "chart".',
      spellingPatterns: ['ar (start)', 'a (father)', 'al (calm)'],
      confusingPairSymbol: 'ʌ',
      examples: [
        { word: 'start', highlightPart: 'ar', ipa: '/stɑːt/', meaningVi: 'bắt đầu' },
        { word: 'part', highlightPart: 'ar', ipa: '/pɑːt/', meaningVi: 'phần' },
        { word: 'calm', highlightPart: 'al', ipa: '/kɑːm/', meaningVi: 'bình tĩnh' },
      ],
      sampleSentence: {
        textEn: 'Stay calm and start Speaking Part 3 with a clear point.',
        textVi: 'Hãy giữ bình tĩnh và bắt đầu Speaking Part 3 bằng một luận điểm rõ ràng.',
        targetWord: 'start',
      },
    },
    {
      number: 12,
      symbol: 'ɒ',
      category: 'monophthong',
      voicing: 'vowel',
      nameVi: 'Âm o ngắn',
      articulationTipVi: 'Mở hàm dưới nhẹ và hơi tròn môi (Anh-Anh), bật ngắn và dứt khoát.',
      vietnamesePitfallVi: 'Hay nhầm sang "ô" tiếng Việt trong các từ "topic", "project", "problem".',
      spellingPatterns: ['o (hot, topic, problem)', 'a (what, want)'],
      confusingPairSymbol: 'ɔː',
      examples: [
        { word: 'topic', highlightPart: 'o', ipa: '/ˈtɒp.ɪk/', meaningVi: 'chủ đề' },
        { word: 'problem', highlightPart: 'o', ipa: '/ˈprɒb.ləm/', meaningVi: 'vấn đề' },
        { word: 'confidence', highlightPart: 'o', ipa: '/ˈkɒn.fɪ.dəns/', meaningVi: 'sự tự tin' },
      ],
      sampleSentence: {
        textEn: 'Solving a tough topic problem boosts your confidence.',
        textVi: 'Giải quyết một vấn đề chủ đề khó giúp tăng sự tự tin của bạn.',
        targetWord: 'topic',
      },
    },

    // 8 Diphthongs
    {
      number: 13,
      symbol: 'ɪə',
      category: 'diphthong',
      voicing: 'vowel',
      nameVi: 'Nguyên âm đôi i-ơ',
      articulationTipVi: 'Bắt đầu từ âm /ɪ/ rõ rồi trượt nhẹ về âm /ə/ thả lỏng.',
      vietnamesePitfallVi: 'Hay đọc phẳng thành /i/ dài và bỏ mất phần trượt về /ə/.',
      spellingPatterns: ['ear (clear)', 'ere (here)', 'eer (career)'],
      confusingPairSymbol: 'eə',
      examples: [
        { word: 'clear', highlightPart: 'ear', ipa: '/klɪər/', meaningVi: 'rõ ràng' },
        { word: 'career', highlightPart: 'eer', ipa: '/kəˈrɪər/', meaningVi: 'sự nghiệp' },
        { word: 'here', highlightPart: 'ere', ipa: '/hɪər/', meaningVi: 'ở đây' },
      ],
      sampleSentence: {
        textEn: 'Clear communication makes a real difference in your career.',
        textVi: 'Giao tiếp rõ ràng tạo nên khác biệt thực sự cho sự nghiệp của bạn.',
        targetWord: 'clear',
      },
    },
    {
      number: 14,
      symbol: 'eɪ',
      category: 'diphthong',
      voicing: 'vowel',
      nameVi: 'Nguyên âm đôi e-i',
      articulationTipVi: 'Bắt đầu từ /e/ rồi khép nhẹ miệng trượt lên /ɪ/.',
      vietnamesePitfallVi: 'Đừng đọc gọn thành chữ "ê" cứng tiếng Việt; luôn có độ lướt lên /ɪ/ ở cuối (như "say", "make").',
      spellingPatterns: ['a_e (make)', 'ai (explain)', 'ay (day)', 'ea (great)'],
      confusingPairSymbol: 'e',
      examples: [
        { word: 'explain', highlightPart: 'ai', ipa: '/ɪkˈspleɪn/', meaningVi: 'giải thích' },
        { word: 'mistake', highlightPart: 'a_e', ipa: '/mɪˈsteɪk/', meaningVi: 'lỗi sai' },
        { word: 'day', highlightPart: 'ay', ipa: '/deɪ/', meaningVi: 'ngày' },
      ],
      sampleSentence: {
        textEn: 'Great speakers explain complex ideas in a simple way.',
        textVi: 'Diễn giả giỏi giải thích ý tưởng phức tạp theo cách đơn giản.',
        targetWord: 'explain',
      },
    },
    {
      number: 15,
      symbol: 'ʊə',
      category: 'diphthong',
      voicing: 'vowel',
      nameVi: 'Nguyên âm đôi u-ơ',
      articulationTipVi: 'Bắt đầu bằng /ʊ/ thả lỏng rồi trượt nhẹ sang /ə/.',
      vietnamesePitfallVi: 'Hay bỏ mất âm chuyển hoặc đọc nặng như "ua".',
      spellingPatterns: ['ure (sure, pure)', 'our (tour)', 'oor (poor)'],
      confusingPairSymbol: 'ɔː',
      examples: [
        { word: 'sure', highlightPart: 'ure', ipa: '/ʃʊər/', meaningVi: 'chắc chắn' },
        { word: 'tour', highlightPart: 'our', ipa: '/tʊər/', meaningVi: 'chuyến tham quan' },
        { word: 'pure', highlightPart: 'ure', ipa: '/pjʊər/', meaningVi: 'thuần túy' },
      ],
      sampleSentence: {
        textEn: 'Make sure you review the tour schedule before boarding.',
        textVi: 'Hãy chắc chắn bạn xem lại lịch trình chuyến đi trước khi lên xe.',
        targetWord: 'sure',
      },
    },
    {
      number: 16,
      symbol: 'ɔɪ',
      category: 'diphthong',
      voicing: 'vowel',
      nameVi: 'Nguyên âm đôi o-i',
      articulationTipVi: 'Mở đầu tròn môi với /ɔː/ rồi thu nhanh sang /ɪ/.',
      vietnamesePitfallVi: 'Thường bỏ âm cuối sau nguyên âm đôi (ví dụ "voice" thiếu /s/, "point" thiếu /t/).',
      spellingPatterns: ['oi (voice, point)', 'oy (enjoy)'],
      confusingPairSymbol: 'aɪ',
      examples: [
        { word: 'voice', highlightPart: 'oi', ipa: '/vɔɪs/', meaningVi: 'giọng nói' },
        { word: 'point', highlightPart: 'oi', ipa: '/pɔɪnt/', meaningVi: 'luận điểm' },
        { word: 'enjoy', highlightPart: 'oy', ipa: '/ɪnˈdʒɔɪ/', meaningVi: 'tận hưởng' },
      ],
      sampleSentence: {
        textEn: 'Enjoy expressing your main point in a steady voice.',
        textVi: 'Hãy thoải mái trình bày luận điểm chính bằng giọng nói vững vàng.',
        targetWord: 'voice',
      },
    },
    {
      number: 17,
      symbol: 'əʊ',
      category: 'diphthong',
      voicing: 'vowel',
      nameVi: 'Nguyên âm đôi ơ-u',
      articulationTipVi: 'Bắt đầu từ giữa miệng (/ə/ hoặc /oʊ/ giọng Mỹ) rồi khép tròn môi dần về /ʊ/.',
      vietnamesePitfallVi: 'Người Việt hay đọc thành âm "ô" đứng yên không trượt môi về cuối.',
      spellingPatterns: ['o_e (note)', 'oa (goal)', 'ow (know)', 'o (focus)'],
      confusingPairSymbol: 'ɔː',
      examples: [
        { word: 'goal', highlightPart: 'oa', ipa: '/ɡəʊl/', meaningVi: 'mục tiêu' },
        { word: 'focus', highlightPart: 'o', ipa: '/ˈfəʊ.kəs/', meaningVi: 'tập trung' },
        { word: 'note', highlightPart: 'o_e', ipa: '/nəʊt/', meaningVi: 'ghi chú' },
      ],
      sampleSentence: {
        textEn: 'Focus on your goal and take notes after every coaching session.',
        textVi: 'Tập trung vào mục tiêu và ghi chú sau mỗi buổi học 1-1.',
        targetWord: 'goal',
      },
    },
    {
      number: 18,
      symbol: 'eə',
      category: 'diphthong',
      voicing: 'vowel',
      nameVi: 'Nguyên âm đôi e-ơ',
      articulationTipVi: 'Mở từ âm /e/ rồi trượt nhẹ về âm /ə/ thả lỏng.',
      vietnamesePitfallVi: 'Hay đọc lẫn giữa "their/there" và "care/chair" với âm /ɪə/.',
      spellingPatterns: ['air (pair)', 'are (compare)', 'ear (wear)', 'ere (where)'],
      confusingPairSymbol: 'ɪə',
      examples: [
        { word: 'compare', highlightPart: 'are', ipa: '/kəmˈpeər/', meaningVi: 'so sánh' },
        { word: 'pair', highlightPart: 'air', ipa: '/peər/', meaningVi: 'cặp đôi' },
        { word: 'prepare', highlightPart: 'are', ipa: '/prɪˈpeər/', meaningVi: 'chuẩn bị' },
      ],
      sampleSentence: {
        textEn: 'Compare this minimal pair carefully to prepare for IELTS.',
        textVi: 'Hãy so sánh kỹ cặp âm tối thiểu này để chuẩn bị cho kỳ thi IELTS.',
        targetWord: 'prepare',
      },
    },
    {
      number: 19,
      symbol: 'aɪ',
      category: 'diphthong',
      voicing: 'vowel',
      nameVi: 'Nguyên âm đôi a-i',
      articulationTipVi: 'Mở hàm rõ ở /a/ rồi nâng lưỡi nhanh lên /ɪ/.',
      vietnamesePitfallVi: 'Thường bị cụt phụ âm cuối sau /aɪ/ như "time", "like", "write".',
      spellingPatterns: ['i_e (time)', 'y (clarify)', 'igh (right)', 'ie (tie)'],
      confusingPairSymbol: 'eɪ',
      examples: [
        { word: 'time', highlightPart: 'i_e', ipa: '/taɪm/', meaningVi: 'thời gian' },
        { word: 'clarify', highlightPart: 'y', ipa: '/ˈklær.ɪ.faɪ/', meaningVi: 'làm rõ' },
        { word: 'idea', highlightPart: 'i', ipa: '/aɪˈdɪə/', meaningVi: 'ý tưởng' },
      ],
      sampleSentence: {
        textEn: 'Take your time to clarify the main idea.',
        textVi: 'Hãy dành thời gian làm rõ ý tưởng chính.',
        targetWord: 'clarify',
      },
    },
    {
      number: 20,
      symbol: 'aʊ',
      category: 'diphthong',
      voicing: 'vowel',
      nameVi: 'Nguyên âm đôi a-u',
      articulationTipVi: 'Mở rộng hàm ở /a/ rồi khép tròn môi dần về /ʊ/.',
      vietnamesePitfallVi: 'Hay đọc phẳng thành "ao" nhanh và quên bật âm cuối ở "sound", "out", "found".',
      spellingPatterns: ['ou (sound, out)', 'ow (now, allow)'],
      confusingPairSymbol: 'əʊ',
      examples: [
        { word: 'sound', highlightPart: 'ou', ipa: '/saʊnd/', meaningVi: 'âm thanh' },
        { word: 'allow', highlightPart: 'ow', ipa: '/əˈlaʊ/', meaningVi: 'cho phép' },
        { word: 'outline', highlightPart: 'ou', ipa: '/ˈaʊt.laɪn/', meaningVi: 'dàn ý' },
      ],
      sampleSentence: {
        textEn: 'Reading aloud helps every ending sound stand out.',
        textVi: 'Đọc to thành tiếng giúp mọi âm cuối trở nên rõ nét hơn.',
        targetWord: 'sound',
      },
    },

    // 24 Consonants
    {
      number: 21,
      symbol: 'p',
      category: 'consonant',
      voicing: 'unvoiced',
      nameVi: 'Âm p vô thanh (bật hơi)',
      articulationTipVi: 'Mím chặt hai môi nén hơi rồi bật mạnh luồng khí ra (đặt tờ giấy trước miệng sẽ thấy bay).',
      vietnamesePitfallVi: 'Hay đọc giống chữ "p/b" không bật hơi tiếng Việt làm mất lực âm đầu câu.',
      spellingPatterns: ['p (plan)', 'pp (happy)'],
      confusingPairSymbol: 'b',
      examples: [
        { word: 'plan', highlightPart: 'p', ipa: '/plæn/', meaningVi: 'kế hoạch' },
        { word: 'practice', highlightPart: 'p', ipa: '/ˈpræk.tɪs/', meaningVi: 'luyện tập' },
        { word: 'keep', highlightPart: 'p', ipa: '/kiːp/', meaningVi: 'giữ' },
      ],
      sampleSentence: {
        textEn: 'Please prepare a practical plan for people.',
        textVi: 'Vui lòng chuẩn bị một kế hoạch thiết thực cho mọi người.',
        targetWord: 'prepare',
      },
    },
    {
      number: 22,
      symbol: 'b',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm b hữu thanh',
      articulationTipVi: 'Mím hai môi tương tự /p/ nhưng làm rung dây thanh quản, hầu như không bật hơi mạnh.',
      vietnamesePitfallVi: 'Thường quên bật nhẹ /b/ khi đứng ở cuối từ như "job", "lab", "club".',
      spellingPatterns: ['b (book)', 'bb (hobby)'],
      confusingPairSymbol: 'p',
      examples: [
        { word: 'balance', highlightPart: 'b', ipa: '/ˈbæl.əns/', meaningVi: 'cân bằng' },
        { word: 'habit', highlightPart: 'b', ipa: '/ˈhæb.ɪt/', meaningVi: 'thói quen' },
        { word: 'job', highlightPart: 'b', ipa: '/dʒɒb/', meaningVi: 'công việc' },
      ],
      sampleSentence: {
        textEn: 'Building a better habit takes patience at your job.',
        textVi: 'Xây dựng thói quen tốt hơn cần sự kiên nhẫn trong công việc.',
        targetWord: 'habit',
      },
    },
    {
      number: 23,
      symbol: 't',
      category: 'consonant',
      voicing: 'unvoiced',
      nameVi: 'Âm t vô thanh (bật hơi)',
      articulationTipVi: 'Đầu lưỡi chạm phần lợi trên ngay sau răng cửa (không chạm răng như tiếng Việt) rồi bật hơi.',
      vietnamesePitfallVi: 'Hay bỏ mất /t/ ở cuối từ ("fast", "impact", "built") hoặc quên bật hơi ở đầu từ.',
      spellingPatterns: ['t (time)', 'tt (better)', 'ed (walked)'],
      confusingPairSymbol: 'd',
      examples: [
        { word: 'time', highlightPart: 't', ipa: '/taɪm/', meaningVi: 'thời gian' },
        { word: 'impact', highlightPart: 't', ipa: '/ˈɪm.pækt/', meaningVi: 'tác động' },
        { word: 'walked', highlightPart: 'ed', ipa: '/wɔːkt/', meaningVi: 'đã đi bộ' },
      ],
      sampleSentence: {
        textEn: 'Take ten minutes to test the target sentences.',
        textVi: 'Hãy dành mười phút kiểm tra các câu mục tiêu.',
        targetWord: 'test',
      },
    },
    {
      number: 24,
      symbol: 'd',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm d hữu thanh',
      articulationTipVi: 'Đặt đầu lưỡi ở lợi trên giống /t/ nhưng rung dây thanh quản khi bật ra.',
      vietnamesePitfallVi: 'Hay đọc giống âm "đ" hút hơi tiếng Việt hoặc nuốt mất /d/ ở cuối ("and", "needed", "world").',
      spellingPatterns: ['d (day)', 'dd (middle)', 'ed (needed)'],
      confusingPairSymbol: 't',
      examples: [
        { word: 'deadline', highlightPart: 'd', ipa: '/ˈded.laɪn/', meaningVi: 'hạn chót' },
        { word: 'word', highlightPart: 'd', ipa: '/wɜːd/', meaningVi: 'từ vựng' },
        { word: 'improved', highlightPart: 'd', ipa: '/ɪmˈpruːvd/', meaningVi: 'đã cải thiện' },
      ],
      sampleSentence: {
        textEn: 'Daily dialogue builds steady confidence.',
        textVi: 'Hội thoại hằng ngày xây dựng sự tự tin vững vàng.',
        targetWord: 'daily',
      },
    },
    {
      number: 25,
      symbol: 'k',
      category: 'consonant',
      voicing: 'unvoiced',
      nameVi: 'Âm k vô thanh (bật hơi)',
      articulationTipVi: 'Nâng phần cuống lưỡi chạm ngạc mềm, chặn hơi rồi bật nhẹ ra; không rung cổ họng.',
      vietnamesePitfallVi: 'Bỏ mất âm /k/ ở cuối các từ như "speak", "work", "topic", "architect".',
      spellingPatterns: ['k (keep)', 'c (topic)', 'ck (check)', 'ch (school)'],
      confusingPairSymbol: 'g',
      examples: [
        { word: 'speak', highlightPart: 'k', ipa: '/spiːk/', meaningVi: 'nói' },
        { word: 'check', highlightPart: 'ck', ipa: '/tʃek/', meaningVi: 'kiểm tra' },
        { word: 'architect', highlightPart: 'ch', ipa: '/ˈɑː.kɪ.tekt/', meaningVi: 'kiến trúc sư' },
      ],
      sampleSentence: {
        textEn: 'Keep checking key vocabulary in context.',
        textVi: 'Tiếp tục kiểm tra từ vựng trọng tâm trong ngữ cảnh.',
        targetWord: 'context',
      },
    },
    {
      number: 26,
      symbol: 'g',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm g hữu thanh',
      articulationTipVi: 'Vị trí lưỡi giống /k/ ở cuống họng nhưng bật ra kèm rung dây thanh.',
      vietnamesePitfallVi: 'Quên phát âm /g/ cuối ở "big", "blog", hoặc đọc lẫn sang /dʒ/ trước nguyên âm.',
      spellingPatterns: ['g (goal)', 'gg (bigger)', 'gu (guide)'],
      confusingPairSymbol: 'k',
      examples: [
        { word: 'goal', highlightPart: 'g', ipa: '/ɡəʊl/', meaningVi: 'mục tiêu' },
        { word: 'agree', highlightPart: 'g', ipa: '/əˈɡriː/', meaningVi: 'đồng ý' },
        { word: 'grammar', highlightPart: 'g', ipa: '/ˈɡræm.ər/', meaningVi: 'ngữ pháp' },
      ],
      sampleSentence: {
        textEn: 'Great progress begins with one clear goal.',
        textVi: 'Tiến bộ lớn bắt đầu từ một mục tiêu rõ ràng.',
        targetWord: 'goal',
      },
    },
    {
      number: 27,
      symbol: 'tʃ',
      category: 'consonant',
      voicing: 'unvoiced',
      nameVi: 'Âm ch vô thanh (bật tròn môi)',
      articulationTipVi: 'Chu môi tròn ra phía trước, đặt đầu lưỡi chạm vòm miệng trên và bật hơi mạnh.',
      vietnamesePitfallVi: 'Hay đọc nhẹ giống "ch" tiếng Việt không chu môi, đặc biệt khi đứng cuối như "watch", "coach", "research".',
      spellingPatterns: ['ch (coach)', 'tch (match)', 'tu (future)'],
      confusingPairSymbol: 'dʒ',
      examples: [
        { word: 'coach', highlightPart: 'ch', ipa: '/kəʊtʃ/', meaningVi: 'huấn luyện viên' },
        { word: 'match', highlightPart: 'tch', ipa: '/mætʃ/', meaningVi: 'ghép cặp' },
        { word: 'future', highlightPart: 'tu', ipa: '/ˈfjuː.tʃər/', meaningVi: 'tương lai' },
      ],
      sampleSentence: {
        textEn: 'Check each phrase with your coach before the pitch.',
        textVi: 'Kiểm tra từng cụm từ với giáo viên trước buổi thuyết trình.',
        targetWord: 'coach',
      },
    },
    {
      number: 28,
      symbol: 'dʒ',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm j/gi hữu thanh (bật tròn môi)',
      articulationTipVi: 'Khẩu hình chu môi hệt /tʃ/ nhưng rung dây thanh quản rõ ở cổ họng.',
      vietnamesePitfallVi: 'Hay đọc thành âm "d/z" tiếng Việt trong các từ "job", "challenge", "manage", "congestion".',
      spellingPatterns: ['j (job)', 'g (manage)', 'dge (knowledge)'],
      confusingPairSymbol: 'tʃ',
      examples: [
        { word: 'job', highlightPart: 'j', ipa: '/dʒɒb/', meaningVi: 'công việc' },
        { word: 'challenge', highlightPart: 'ge', ipa: '/ˈtʃæl.ɪndʒ/', meaningVi: 'thử thách' },
        { word: 'leverage', highlightPart: 'ge', ipa: '/ˈlev.ər.ɪdʒ/', meaningVi: 'tận dụng' },
      ],
      sampleSentence: {
        textEn: 'Enjoy managing each challenging project step by step.',
        textVi: 'Hãy hứng thú với việc quản lý từng dự án thử thách từng bước một.',
        targetWord: 'manage',
      },
    },
    {
      number: 29,
      symbol: 'f',
      category: 'consonant',
      voicing: 'unvoiced',
      nameVi: 'Âm f vô thanh',
      articulationTipVi: 'Răng cửa trên chạm nhẹ lên lòng môi dưới và thổi luồng khí đều ra ngoài, không rung cổ.',
      vietnamesePitfallVi: 'Khá gần âm "ph" tiếng Việt nhưng người Việt hay bỏ âm /f/ khi đứng cuối từ như "staff", "brief", "safe".',
      spellingPatterns: ['f (focus)', 'ff (different)', 'ph (phrase)', 'gh (enough)'],
      confusingPairSymbol: 'v',
      examples: [
        { word: 'focus', highlightPart: 'f', ipa: '/ˈfəʊ.kəs/', meaningVi: 'tập trung' },
        { word: 'phrase', highlightPart: 'ph', ipa: '/freɪz/', meaningVi: 'cụm từ' },
        { word: 'brief', highlightPart: 'f', ipa: '/briːf/', meaningVi: 'ngắn gọn' },
      ],
      sampleSentence: {
        textEn: 'Focus on five useful phrases for a brief meeting.',
        textVi: 'Tập trung vào năm cụm từ hữu ích cho một cuộc họp ngắn gọn.',
        targetWord: 'brief',
      },
    },
    {
      number: 30,
      symbol: 'v',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm v hữu thanh',
      articulationTipVi: 'Răng trên chạm môi dưới giống /f/ nhưng rung mạnh dây thanh quản.',
      vietnamesePitfallVi: 'Hay đọc giống "giờ/dờ" hoặc bỏ hẳn /v/ cuối từ ("improve", "have", "five", "live").',
      spellingPatterns: ['v (voice, improve, five)'],
      confusingPairSymbol: 'f',
      examples: [
        { word: 'improve', highlightPart: 'v', ipa: '/ɪmˈpruːv/', meaningVi: 'cải thiện' },
        { word: 'voice', highlightPart: 'v', ipa: '/vɔɪs/', meaningVi: 'giọng nói' },
        { word: 'review', highlightPart: 'v', ipa: '/rɪˈvjuː/', meaningVi: 'ôn tập' },
      ],
      sampleSentence: {
        textEn: 'Review five vocabulary cards every evening to improve.',
        textVi: 'Ôn năm thẻ từ vựng mỗi tối để tiến bộ.',
        targetWord: 'improve',
      },
    },
    {
      number: 31,
      symbol: 'θ',
      category: 'consonant',
      voicing: 'unvoiced',
      nameVi: 'Âm th vô thanh (đặt lưỡi giữa hai răng)',
      articulationTipVi: 'Đưa nhẹ đầu lưỡi ra giữa hai hàm răng cửa, thổi hơi qua khe răng mà không làm rung cổ họng.',
      vietnamesePitfallVi: 'Lỗi phổ biến nhất: đọc thành âm "thờ" tiếng Việt (/t/), làm "think" giống "tink" hoặc "both" giống "boat".',
      spellingPatterns: ['th (think, method, both, month)'],
      confusingPairSymbol: 'ð',
      examples: [
        { word: 'think', highlightPart: 'th', ipa: '/θɪŋk/', meaningVi: 'suy nghĩ' },
        { word: 'method', highlightPart: 'th', ipa: '/ˈmeθ.əd/', meaningVi: 'phương pháp' },
        { word: 'both', highlightPart: 'th', ipa: '/bəʊθ/', meaningVi: 'cả hai' },
      ],
      sampleSentence: {
        textEn: 'Think thoroughly about both methods this month.',
        textVi: 'Hãy suy nghĩ kỹ về cả hai phương pháp trong tháng này.',
        targetWord: 'method',
      },
    },
    {
      number: 32,
      symbol: 'ð',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm th hữu thanh (đặt lưỡi giữa hai răng)',
      articulationTipVi: 'Vị trí đầu lưỡi giữa hai răng hệt /θ/ nhưng bật ra kèm độ rung rõ ở cổ họng.',
      vietnamesePitfallVi: 'Hay đọc thành âm "đ" hoặc "d" ("this" → "đít", "the" → "đờ").',
      spellingPatterns: ['th (this, that, they, together, smooth)'],
      confusingPairSymbol: 'θ',
      examples: [
        { word: 'this', highlightPart: 'th', ipa: '/ðɪs/', meaningVi: 'cái này' },
        { word: 'together', highlightPart: 'th', ipa: '/təˈɡeð.ər/', meaningVi: 'cùng nhau' },
        { word: 'smooth', highlightPart: 'th', ipa: '/smuːð/', meaningVi: 'trôi chảy, mượt mà' },
      ],
      sampleSentence: {
        textEn: 'They practice these smooth dialogues together.',
        textVi: 'Họ cùng nhau luyện tập những đoạn hội thoại mượt mà này.',
        targetWord: 'together',
      },
    },
    {
      number: 33,
      symbol: 's',
      category: 'consonant',
      voicing: 'unvoiced',
      nameVi: 'Âm s vô thanh (xì nhẹ)',
      articulationTipVi: 'Hai hàm răng khép hờ, đầu lưỡi gần lợi trên, đẩy luồng khí mảnh phát ra tiếng "xì" sắc.',
      vietnamesePitfallVi: 'Hay bỏ sót /s/ ở cuối danh từ số nhiều hoặc động từ ngôi thứ 3 ("metrics", "projects", "speaks").',
      spellingPatterns: ['s (speak)', 'ss (lesson)', 'c (concise)', 'ce (balance)'],
      confusingPairSymbol: 'z',
      examples: [
        { word: 'speak', highlightPart: 's', ipa: '/spiːk/', meaningVi: 'nói' },
        { word: 'concise', highlightPart: 'c', ipa: '/kənˈsaɪs/', meaningVi: 'ngắn gọn' },
        { word: 'metrics', highlightPart: 's', ipa: '/ˈmet.rɪks/', meaningVi: 'chỉ số đo lường' },
      ],
      sampleSentence: {
        textEn: 'Six students spoke concise sentences in class.',
        textVi: 'Sáu học viên đã nói những câu súc tích trong lớp.',
        targetWord: 'sentence',
      },
    },
    {
      number: 34,
      symbol: 'z',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm z hữu thanh',
      articulationTipVi: 'Khẩu hình giống hệt /s/ nhưng rung mạnh dây thanh quản tạo âm rè như tiếng ong.',
      vietnamesePitfallVi: 'Đọc lẫn toàn bộ đuôi -s/-es thành /s/ hoặc quên hẳn không đọc ("rise" vs "rice", "is", "reasons").',
      spellingPatterns: ['z (zero)', 's (reason, rise, use)', 'se (compromise)'],
      confusingPairSymbol: 's',
      examples: [
        { word: 'rise', highlightPart: 's', ipa: '/raɪz/', meaningVi: 'tăng lên' },
        { word: 'reason', highlightPart: 's', ipa: '/ˈriː.zən/', meaningVi: 'lý do' },
        { word: 'quiz', highlightPart: 'z', ipa: '/kwɪz/', meaningVi: 'bài kiểm tra nhanh' },
      ],
      sampleSentence: {
        textEn: 'These quizzes always raise your listening precision.',
        textVi: 'Những bài kiểm tra nhanh này luôn nâng độ chính xác nghe của bạn.',
        targetWord: 'quizzes',
      },
    },
    {
      number: 35,
      symbol: 'ʃ',
      category: 'consonant',
      voicing: 'unvoiced',
      nameVi: 'Âm sh vô thanh (nặng, chu môi)',
      articulationTipVi: 'Chu môi tròn nhẹ ra trước như ra hiệu "suỵt", mặt lưỡi nâng lên và đẩy hơi mạnh không rung cổ.',
      vietnamesePitfallVi: 'Hay đọc phẳng miệng thành /s/ làm "she" giống "see", hoặc "session" thành "xét-sừn".',
      spellingPatterns: ['sh (ship)', 'ti (nation)', 'ss (session)', 'ci (efficient)'],
      confusingPairSymbol: 's',
      examples: [
        { word: 'shadowing', highlightPart: 'sh', ipa: '/ˈʃæd.əʊ.ɪŋ/', meaningVi: 'nói đuổi' },
        { word: 'session', highlightPart: 'ssi', ipa: '/ˈseʃ.ən/', meaningVi: 'buổi học' },
        { word: 'efficient', highlightPart: 'ci', ipa: '/ɪˈfɪʃ.ənt/', meaningVi: 'hiệu quả' },
      ],
      sampleSentence: {
        textEn: 'Short shadowing sessions create sharp pronunciation.',
        textVi: 'Những phiên nói đuổi ngắn tạo nên phát âm sắc nét.',
        targetWord: 'session',
      },
    },
    {
      number: 36,
      symbol: 'ʒ',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm zh hữu thanh (nặng, chu môi)',
      articulationTipVi: 'Chu môi hệt /ʃ/ nhưng rung mạnh dây thanh quản.',
      vietnamesePitfallVi: 'Thường bị đọc nhầm thành /dʒ/ hoặc /z/ trong "decision", "vision", "measure".',
      spellingPatterns: ['si (decision, vision)', 'su (measure, usually)'],
      confusingPairSymbol: 'dʒ',
      examples: [
        { word: 'decision', highlightPart: 'si', ipa: '/dɪˈsɪʒ.ən/', meaningVi: 'quyết định' },
        { word: 'measure', highlightPart: 's', ipa: '/ˈmeʒ.ər/', meaningVi: 'đo lường' },
        { word: 'usually', highlightPart: 's', ipa: '/ˈjuː.ʒu.ə.li/', meaningVi: 'thường xuyên' },
      ],
      sampleSentence: {
        textEn: 'Usually, we measure progress before making a decision.',
        textVi: 'Thông thường, chúng tôi đo lường tiến bộ trước khi ra quyết định.',
        targetWord: 'decision',
      },
    },
    {
      number: 37,
      symbol: 'm',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm mũi m',
      articulationTipVi: 'Mím hai môi nhẹ nhàng và đẩy luồng âm rung qua đường mũi.',
      vietnamesePitfallVi: 'Khi /m/ đứng cuối từ ("time", "team", "problem"), cần mím môi khép âm rõ thay vì bỏ lửng miệng mở.',
      spellingPatterns: ['m (time)', 'mm (grammar)', 'mb (climb)'],
      confusingPairSymbol: 'n',
      examples: [
        { word: 'commit', highlightPart: 'mm', ipa: '/kəˈmɪt/', meaningVi: 'cam kết' },
        { word: 'time', highlightPart: 'm', ipa: '/taɪm/', meaningVi: 'thời gian' },
        { word: 'system', highlightPart: 'm', ipa: '/ˈsɪs.təm/', meaningVi: 'hệ thống' },
      ],
      sampleSentence: {
        textEn: 'Commit time every morning to master important idioms.',
        textVi: 'Cam kết thời gian mỗi sáng để thành thạo các thành ngữ quan trọng.',
        targetWord: 'time',
      },
    },
    {
      number: 38,
      symbol: 'n',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm mũi n',
      articulationTipVi: 'Đầu lưỡi chạm phần lợi trên sau răng cửa, thoát âm rung qua mũi.',
      vietnamesePitfallVi: 'Hay nhầm với /ŋ/ hoặc /l/ (ngọng vùng miền), hoặc bỏ mất âm /n/ cuối ("line", "plan").',
      spellingPatterns: ['n (note)', 'nn (connect)', 'kn (know)'],
      confusingPairSymbol: 'ŋ',
      examples: [
        { word: 'note', highlightPart: 'n', ipa: '/nəʊt/', meaningVi: 'ghi chú' },
        { word: 'plan', highlightPart: 'n', ipa: '/plæn/', meaningVi: 'kế hoạch' },
        { word: 'fluency', highlightPart: 'n', ipa: '/ˈfluː.ən.si/', meaningVi: 'độ trôi chảy' },
      ],
      sampleSentence: {
        textEn: 'Nine learners planned a new conversation note.',
        textVi: 'Chín học viên đã lên kế hoạch ghi chú hội thoại mới.',
        targetWord: 'plan',
      },
    },
    {
      number: 39,
      symbol: 'ŋ',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm mũi ng (cuống lưỡi)',
      articulationTipVi: 'Nâng phần cuống lưỡi chạm ngạc mềm ở phía sau và đẩy âm mũi (không bật /g/ ở cuối từ như "sing").',
      vietnamesePitfallVi: 'Ở cuối động từ V-ing ("speaking", "listening") hay đọc lướt thành /n/ ("speakin") hoặc thêm /k/.',
      spellingPatterns: ['ng (speaking)', 'n (think, bank)'],
      confusingPairSymbol: 'n',
      examples: [
        { word: 'speaking', highlightPart: 'ng', ipa: '/ˈspiː.kɪŋ/', meaningVi: 'kỹ năng nói' },
        { word: 'listening', highlightPart: 'ng', ipa: '/ˈlɪs.ən.ɪŋ/', meaningVi: 'kỹ năng nghe' },
        { word: 'think', highlightPart: 'n', ipa: '/θɪŋk/', meaningVi: 'suy nghĩ' },
      ],
      sampleSentence: {
        textEn: 'Listening and shadowing bring strong speaking skills.',
        textVi: 'Nghe chép và nói đuổi mang lại kỹ năng nói vững chắc.',
        targetWord: 'speaking',
      },
    },
    {
      number: 40,
      symbol: 'h',
      category: 'consonant',
      voicing: 'unvoiced',
      nameVi: 'Âm h vô thanh (hà hơi)',
      articulationTipVi: 'Mở nhẹ họng và hà một luồng hơi êm từ cổ họng ra ngoài như thở nhẹ lên kính.',
      vietnamesePitfallVi: 'Hay đọc quá gằn ở cổ hoặc bỏ quên chữ h câm ("hour", "honest").',
      spellingPatterns: ['h (habit)', 'wh (who)'],
      confusingPairSymbol: 'f',
      examples: [
        { word: 'habit', highlightPart: 'h', ipa: '/ˈhæb.ɪt/', meaningVi: 'thói quen' },
        { word: 'help', highlightPart: 'h', ipa: '/help/', meaningVi: 'giúp đỡ' },
        { word: 'cohort', highlightPart: 'h', ipa: '/ˈkəʊ.hɔːt/', meaningVi: 'nhóm học' },
      ],
      sampleSentence: {
        textEn: 'Helpful hints help learners form high-impact habits.',
        textVi: 'Những gợi ý hữu ích giúp người học hình thành thói quen hiệu quả cao.',
        targetWord: 'habit',
      },
    },
    {
      number: 41,
      symbol: 'l',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm l (đầu lưỡi chạm lợi)',
      articulationTipVi: 'Đầu lưỡi uốn chạm nhẹ vào lợi trên; chú ý "Dark L" ở cuối từ ("goal", "well", "skill") giữ lưỡi chạm lợi.',
      vietnamesePitfallVi: 'Hay đọc thiếu Dark L ở cuối từ, biến "goal" thành "gâu", "well" thành "oeo", "skill" thành "skiêu".',
      spellingPatterns: ['l (learn)', 'll (skill, well)', 'le (feasible)'],
      confusingPairSymbol: 'r',
      examples: [
        { word: 'learn', highlightPart: 'l', ipa: '/lɜːn/', meaningVi: 'học' },
        { word: 'skill', highlightPart: 'll', ipa: '/skɪl/', meaningVi: 'kỹ năng' },
        { word: 'feasible', highlightPart: 'le', ipa: '/ˈfiː.zə.bəl/', meaningVi: 'khả thi' },
      ],
      sampleSentence: {
        textEn: 'Small daily drills level up your overall skill.',
        textVi: 'Các bài luyện nhỏ mỗi ngày nâng tầm kỹ năng tổng thể của bạn.',
        targetWord: 'skill',
      },
    },
    {
      number: 42,
      symbol: 'r',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm r tiếng Anh (cuộn lưỡi không rung)',
      articulationTipVi: 'Hơi chu môi nhẹ và cuộn đầu lưỡi hướng lên vòm miệng **không chạm**, không rung lưỡi như tiếng Việt.',
      vietnamesePitfallVi: 'Hay đọc thành âm "r" rung hoặc "d/z" tiếng Việt; trong cụm "tr", "dr" cần cuộn lưỡi mượt.',
      spellingPatterns: ['r (read)', 'rr (correct)', 'wr (write)'],
      confusingPairSymbol: 'l',
      examples: [
        { word: 'read', highlightPart: 'r', ipa: '/riːd/', meaningVi: 'đọc' },
        { word: 'correct', highlightPart: 'rr', ipa: '/kəˈrekt/', meaningVi: 'chính xác' },
        { word: 'write', highlightPart: 'wr', ipa: '/raɪt/', meaningVi: 'viết' },
      ],
      sampleSentence: {
        textEn: 'Read reports regularly to write clearer summaries.',
        textVi: 'Đọc báo cáo thường xuyên để viết tóm tắt rõ ràng hơn.',
        targetWord: 'regularly',
      },
    },
    {
      number: 43,
      symbol: 'w',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm bán nguyên âm w (tròn môi)',
      articulationTipVi: 'Chu môi tròn nhỏ như sắp thổi sáo rồi mở nhanh sang nguyên âm tiếp theo.',
      vietnamesePitfallVi: 'Hay đọc giống "quờ/gờ" tiếng Việt hoặc không chu môi trước âm /ɪ/ ("win", "work", "question").',
      spellingPatterns: ['w (work)', 'wh (what)', 'u (question)'],
      confusingPairSymbol: 'v',
      examples: [
        { word: 'work', highlightPart: 'w', ipa: '/wɜːk/', meaningVi: 'làm việc' },
        { word: 'week', highlightPart: 'w', ipa: '/wiːk/', meaningVi: 'tuần' },
        { word: 'question', highlightPart: 'u', ipa: '/ˈkwes.tʃən/', meaningVi: 'câu hỏi' },
      ],
      sampleSentence: {
        textEn: 'We work well together twice a week.',
        textVi: 'Chúng tôi làm việc ăn ý hai lần mỗi tuần.',
        targetWord: 'work',
      },
    },
    {
      number: 44,
      symbol: 'j',
      category: 'consonant',
      voicing: 'voiced',
      nameVi: 'Âm bán nguyên âm j (lướt y)',
      articulationTipVi: 'Nâng phần giữa lưỡi lên gần vòm miệng giống /iː/ rồi trượt nhanh sang nguyên âm sau ("yes", "use", "schedule").',
      vietnamesePitfallVi: 'Thường quên âm lướt /j/ trong "use", "university", "review", "student" (Anh-Anh).',
      spellingPatterns: ['y (yes, your)', 'u (use, university)', 'ew (review)'],
      confusingPairSymbol: 'dʒ',
      examples: [
        { word: 'yes', highlightPart: 'y', ipa: '/jes/', meaningVi: 'có, vâng' },
        { word: 'useful', highlightPart: 'u', ipa: '/ˈjuːs.fəl/', meaningVi: 'hữu ích' },
        { word: 'review', highlightPart: 'ew', ipa: '/rɪˈvjuː/', meaningVi: 'ôn lại' },
      ],
      sampleSentence: {
        textEn: 'Your yearly review shows useful fluency gains.',
        textVi: 'Đánh giá hằng năm của bạn cho thấy mức tăng độ trôi chảy hữu ích.',
        targetWord: 'useful',
      },
    },
  ];
}

async function fetchBritishCouncilLesson(url: string, meta: {
  slug: string;
  title: string;
  titleVi: string;
  topic: string;
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  goalType: 'communication' | 'business' | 'ielts';
  translations: string[];
}) {
  const segments: Array<{
    index: number;
    speaker?: string;
    startSec: number;
    endSec: number;
    textEn: string;
    textVi: string;
    keyPhrase?: string;
  }> = [];

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const html = await res.text();
      const clean = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/<[^>]+>/g, '\n')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const tIdx = clean.indexOf('Transcript');
      if (tIdx !== -1) {
        const lines: Array<{ speaker: string; text: string }> = [];
        for (let i = tIdx + 1; i < clean.length - 1 && lines.length < meta.translations.length; i += 1) {
          const cur = clean[i];
          const nxt = clean[i + 1];
          if (cur === 'Task' || cur === 'Discussion' || cur.startsWith('Language level')) break;
          if (/^[A-Za-z0-9 ]{2,20}$/.test(cur) && nxt.startsWith(':')) {
            const text = nxt.replace(/^:\s*/, '').replace(/\s+/g, ' ').trim();
            if (cur !== 'Ana' && text.length >= 2) {
              lines.push({ speaker: cur, text });
            }
          }
        }
        lines.slice(0, meta.translations.length).forEach((l, idx) => {
          segments.push({
            index: idx,
            speaker: l.speaker,
            startSec: idx * 5,
            endSec: idx * 5 + 5,
            textEn: l.text,
            textVi: meta.translations[idx] ?? l.text,
          });
        });
      }
    }
  } catch {
    // Fallback handled below
  }

  return {
    slug: meta.slug,
    title: meta.title,
    titleVi: meta.titleVi,
    topic: meta.topic,
    cefrLevel: meta.cefrLevel,
    goalType: meta.goalType,
    durationSec: Math.max(45, segments.length * 6),
    mediaType: 'speech' as const,
    sourceName: 'British Council LearnEnglish',
    sourceUrl: url,
    licenseNote: 'Public free resource transcript attributed to British Council LearnEnglish.',
    segments,
  };
}

async function fetchVoaLesson(url: string, meta: {
  slug: string;
  title: string;
  titleVi: string;
  topic: string;
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
  goalType: 'communication' | 'business' | 'ielts';
  fallbackMediaUrl: string;
  fallbackYoutubeId?: string;
  fallbackSegments: Array<{ speaker: string; textEn: string; textVi: string; keyPhrase?: string }>;
}) {
  let mediaUrl = meta.fallbackMediaUrl;
  let youtubeId = meta.fallbackYoutubeId;

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const html = await res.text();
      const mp4 = html.match(/https:\/\/voa-video-ns\.akamaized\.net\/[^"'\s]+_480p\.mp4/);
      if (mp4) mediaUrl = mp4[0];
      const yt = html.match(/(?:youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
      if (yt) youtubeId = yt[1];
    }
  } catch {
    // Use verified fallback metadata
  }

  return {
    slug: meta.slug,
    title: meta.title,
    titleVi: meta.titleVi,
    topic: meta.topic,
    cefrLevel: meta.cefrLevel,
    goalType: meta.goalType,
    durationSec: meta.fallbackSegments.length * 6,
    mediaType: 'mp4' as const,
    mediaUrl,
    youtubeId,
    sourceName: 'VOA Learning English (Public Domain)',
    sourceUrl: url,
    licenseNote: 'Public Domain (U.S. Government / Voice of America Learning English).',
    segments: meta.fallbackSegments.map((s, idx) => ({
      index: idx,
      speaker: s.speaker,
      startSec: idx * 5,
      endSec: idx * 5 + 5,
      textEn: s.textEn,
      textVi: s.textVi,
      keyPhrase: s.keyPhrase,
    })),
  };
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  console.log('1/3 Enriching vocabulary words via Free Dictionary API...');
  const enrichedWords = [];
  for (const spec of WORD_SPECS) {
    const item = await enrichWord(spec);
    enrichedWords.push(item);
  }
  await fs.writeFile(
    path.join(DATA_DIR, 'openVocabDecks.json'),
    JSON.stringify({ decks: DECK_SPECS, cards: enrichedWords }, null, 2),
    'utf8',
  );
  console.log(`Saved ${DECK_SPECS.length} decks and ${enrichedWords.length} cards.`);

  console.log('2/3 Writing 44-sound English IPA chart dataset...');
  const ipaChart = buildIpaChartData();
  await fs.writeFile(
    path.join(DATA_DIR, 'openIpaChart.json'),
    JSON.stringify(ipaChart, null, 2),
    'utf8',
  );
  console.log(`Saved ${ipaChart.length} IPA symbols.`);

  console.log('3/3 Fetching VOA Public Domain & British Council transcripts...');
  const voaWelcome = await fetchVoaLesson(
    'https://learningenglish.voanews.com/a/lets-learn-english-lesson-one/3111026.html',
    {
      slug: 'voa-welcome-anna-a1',
      title: "Let's Learn English: Welcome to My Apartment",
      titleVi: 'Làm quen & Chào hỏi tự nhiên (VOA Level 1 · A1–A2)',
      topic: 'Daily Life & Introductions',
      cefrLevel: 'A1',
      goalType: 'communication',
      fallbackMediaUrl:
        'https://voa-video-ns.akamaized.net/pangeavideo/2021/02/5/5f/5f00c78a-0f84-41e6-949d-bd808bcadf50_480p.mp4',
      fallbackYoutubeId: 'IpIhzFh0yw8',
      fallbackSegments: [
        { speaker: 'Pete', textEn: 'Hi! Are you Anna?', textVi: 'Chào bạn! Bạn là Anna phải không?', keyPhrase: 'Are you...' },
        { speaker: 'Anna', textEn: 'Yes! Hi there! Are you Pete?', textVi: 'Đúng rồi! Chào bạn! Bạn là Pete à?', keyPhrase: 'Hi there!' },
        { speaker: 'Pete', textEn: 'I am Pete.', textVi: 'Mình là Pete.' },
        { speaker: 'Anna', textEn: "I'm Anna. Nice to meet you.", textVi: 'Mình là Anna. Rất vui được gặp bạn.', keyPhrase: 'Nice to meet you' },
        { speaker: 'Pete', textEn: 'Welcome to 1400 Irving Street!', textVi: 'Chào mừng đến số 1400 phố Irving!', keyPhrase: 'Welcome to' },
        { speaker: 'Anna', textEn: 'My new apartment! Yes!', textVi: 'Căn hộ mới của mình! Tuyệt quá!', keyPhrase: 'apartment' },
      ],
    },
  );

  const voaWorkplace = await fetchVoaLesson(
    'https://learningenglish.voanews.com/a/lets-learn-english-level-2-lesson1/3960391.html',
    {
      slug: 'voa-budget-cuts-b1',
      title: 'Level 2: Workplace Rumors & Budget Cuts',
      titleVi: 'Trao đổi nơi công sở & Tin tức cuộc họp (VOA Level 2 · B1)',
      topic: 'Workplace Communication',
      cefrLevel: 'B1',
      goalType: 'business',
      fallbackMediaUrl:
        'https://voa-video-ns.akamaized.net/pangeavideo/2021/02/7/7a/7a055fd0-0345-41e4-b24d-37df1736f3d1_480p.mp4',
      fallbackSegments: [
        { speaker: 'Anna', textEn: 'My boss has called an important meeting.', textVi: 'Sếp của mình vừa triệu tập một cuộc họp quan trọng.', keyPhrase: 'called a meeting' },
        { speaker: 'Anna', textEn: 'So, Jonathan, what do you think today is about?', textVi: 'Vậy Jonathan, cậu nghĩ hôm nay họp về chuyện gì?', keyPhrase: 'what do you think' },
        { speaker: 'Jonathan', textEn: 'Well, I have heard people talking about budget cuts.', textVi: 'À, mình nghe mọi người nói về việc cắt giảm ngân sách.', keyPhrase: 'budget cuts' },
        { speaker: 'Anna', textEn: 'We should not gossip because that is how rumors start.', textVi: 'Chúng ta không nên bàn tán vì tin đồn bắt đầu từ đó.', keyPhrase: 'rumors start' },
        { speaker: 'Jonathan', textEn: 'You are right, let us wait and see what happens.', textVi: 'Cậu nói đúng, cứ chờ xem chuyện gì sẽ xảy ra.', keyPhrase: 'wait and see' },
      ],
    },
  );

  const bcAgreeing = await fetchBritishCouncilLesson(
    'https://learnenglish.britishcouncil.org/free-resources/speaking/b1/agreeing-disagreeing',
    {
      slug: 'bc-agreeing-disagreeing-b1',
      title: 'Agreeing and Disagreeing Politely in Design Review',
      titleVi: 'Đồng ý & Phản biện lịch sự trong họp sản phẩm (B1)',
      topic: 'Design & Product Critique',
      cefrLevel: 'B1',
      goalType: 'business',
      translations: [
        'Thế nào?',
        'Mình chưa thực sự bị thuyết phục bởi ý tưởng đó.',
        'Tại sao vậy?',
        'Ờ, bản thiết kế này trông hơi đơn giản quá.',
        'Nó không phải đơn giản đâu, mà là phong cách tối giản theo đúng yêu cầu khách hàng.',
        'Mình không chắc lắm. Hãy xem lại các mẫu thiết kế này xem. Mình nghĩ đây mới là phong cách khách hàng muốn.',
        'Ừm... mình nghĩ mình không đồng tình. Họ nói họ muốn sự gọn gàng và tối giản.',
        'Các thiết kế này đúng là gọn gàng và tối giản.',
        'Nghe này, đừng hiểu nhầm ý mình. Mình thích chúng nhưng thấy chưa khớp đề bài. Ví dụ ở đây hơi có quá nhiều chi tiết.',
        'Được rồi, mình hiểu ý bạn, nhưng bỏ hết màu đi sẽ trông hơi trống trải.',
        'Đúng vậy. Vậy thử bỏ chi tiết này và chi tiết kia đi xem? Để vẫn thú vị mà bớt rối hơn.',
        'Được đó... có lẽ bạn có lý ở điểm này. Thực ra điều đó vừa gợi cho mình một ý tưởng.',
        'Vậy mình bỏ màu xanh nhé. Mình nghĩ làm vậy sẽ tạo được sự cân bằng đẹp.',
        'Ừ, đúng rồi. Mình nghĩ bạn nói phải. Đổi mấy hình tròn cũng giúp ích đấy.',
      ],
    },
  );
  if (bcAgreeing.segments.length === 0) {
    bcAgreeing.segments = [
      {
        index: 0,
        speaker: 'Emir',
        startSec: 0,
        endSec: 5,
        textEn: "I'm not convinced by that idea.",
        textVi: 'Mình chưa thực sự bị thuyết phục bởi ý tưởng đó.',
        keyPhrase: 'not convinced by',
      },
      {
        index: 1,
        speaker: 'Paul',
        startSec: 5,
        endSec: 10,
        textEn: "It's not simple, it's minimal, and it's what the client asked for.",
        textVi: 'Nó không phải đơn sơ, mà là tối giản đúng như khách hàng yêu cầu.',
        keyPhrase: 'asked for',
      },
      {
        index: 2,
        speaker: 'Paul',
        startSec: 10,
        endSec: 15,
        textEn: "Look, don't get me wrong, I like them, but they don't fit the brief.",
        textVi: 'Đừng hiểu nhầm ý mình, mình thích chúng nhưng chưa khớp đề bài.',
        keyPhrase: "don't get me wrong",
      },
      {
        index: 3,
        speaker: 'Emir',
        startSec: 15,
        endSec: 20,
        textEn: "OK, maybe you've got a point there.",
        textVi: 'Được rồi, có lẽ bạn có lý ở điểm đó.',
        keyPhrase: 'got a point',
      },
    ];
  }

  const bcCustomerCall = await fetchBritishCouncilLesson(
    'https://learnenglish.britishcouncil.org/free-resources/listening/b1/phone-call-customer',
    {
      slug: 'bc-customer-phone-call-b1',
      title: 'A Phone Call From a Customer: Payment Terms',
      titleVi: 'Nghe cuộc gọi khách hàng xin gia hạn thanh toán (B1)',
      topic: 'Business Calls & Negotiation',
      cefrLevel: 'B1',
      goalType: 'business',
      translations: [
        'Xin chào, Junko Mori đang nghe. Tôi có thể giúp gì cho bạn?',
        'Chào Junko, tôi là Andrea từ Red Band gọi về đơn hàng gần nhất.',
        'Mọi thứ đã giao đến ổn thỏa chứ? Bên tôi đã nhận được xác nhận giao hàng.',
        'Vâng, đơn hàng ổn cả. Tôi gọi để trao đổi về hóa đơn và hạn thanh toán.',
        'Bạn cần hỗ trợ điều gì vậy?',
        'Hơi khó mở lời nhưng tôi cần gia hạn thời gian thanh toán lên 60 ngày.',
        'Tôi không chắc có thể làm vậy vì chúng tôi cũng cần quản lý dòng tiền.',
        'Tôi hứa việc này sẽ không thành tiền lệ, và tôi cũng muốn đặt thêm đơn mới.',
        'Tôi hiểu rồi. Vậy khó khăn dòng tiền sẽ được giải quyết sau đơn hàng mới.',
        'Chính xác là như vậy.',
      ],
    },
  );
  if (bcCustomerCall.segments.length === 0) {
    bcCustomerCall.segments = [
      {
        index: 0,
        speaker: 'Junko',
        startSec: 0,
        endSec: 5,
        textEn: 'Hello, Junko Mori speaking. How can I help you?',
        textVi: 'Xin chào, Junko Mori đang nghe. Tôi có thể giúp gì cho bạn?',
        keyPhrase: 'How can I help you',
      },
      {
        index: 1,
        speaker: 'Andrea',
        startSec: 5,
        endSec: 10,
        textEn: 'I am calling about the invoice and the payment terms.',
        textVi: 'Tôi gọi để trao đổi về hóa đơn và điều khoản thanh toán.',
        keyPhrase: 'payment terms',
      },
      {
        index: 2,
        speaker: 'Andrea',
        startSec: 10,
        endSec: 15,
        textEn: 'You would really be helping us out if you could extend it to sixty days.',
        textVi: 'Bạn sẽ giúp chúng tôi rất nhiều nếu có thể gia hạn lên sáu mươi ngày.',
        keyPhrase: 'extend it to',
      },
    ];
  }

  const mediaLessons = [voaWelcome, voaWorkplace, bcAgreeing, bcCustomerCall];
  await fs.writeFile(
    path.join(DATA_DIR, 'openMediaLessons.json'),
    JSON.stringify(mediaLessons, null, 2),
    'utf8',
  );
  console.log(`Saved ${mediaLessons.length} segmented media lessons.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

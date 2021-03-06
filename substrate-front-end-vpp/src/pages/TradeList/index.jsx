import React, {useState, useEffect, useContext} from 'react';
import {
  Card,
  Input,
  List,
  Radio,
  Button, message, Modal
} from 'antd';
import {PageHeaderWrapper} from '@ant-design/pro-layout';
import {web3FromSource} from "@polkadot/extension-dapp";
import TradeListCell from "@/pages/TradeList/components/TradeListCell";
import {AccountsContext} from "@/context/accounts";
import {ApiContext} from "@/context/api";
import {transformParams, txErrHandler, txResHandler} from "@/components/TxButton/utils";
import OperationModal from './components/OperationModal';
import AddEditModal from "./components/AddEditModal";
import styles from './style.less';

const RadioButton = Radio.Button;
const RadioGroup = Radio.Group;
const {Search} = Input;

const paginationProps = {
  showSizeChanger: true,
  showQuickJumper: true,
  pageSize: 5,
};

const convert = (from, to) => str => Buffer.from(str, from).toString(to);
const utf8ToHex = convert('utf8', 'hex');
const hexToUtf8 = convert('hex', 'utf8');

export const TradeList = () => {
  const [visible, setVisible] = useState(false);
  const [visibleModal, setVisibleModal] = useState(false);
  const [operation, setOperation] = useState(1);// 1购买 2出售
  const [addEdit, setAddEdit] = useState(1);// 1新增 2编辑
  const [unsub, setUnsub] = useState(null);

  const [count, setCount] = useState();
  const [dataSource, setDataSource] = useState([]);
  const {address,keyring} = useContext(AccountsContext);
  const {api} = useContext(ApiContext);
  const [accountPair, setAccountPair] = useState(null);

  // get pair
  useEffect(() => {
    if (!api && !keyring && !address) return;
    setAccountPair(keyring.getPair(address));
  },[keyring]);

  // get vpp count
  useEffect(() => {
    if (!api || !address) return;
    api.query.tradeModule.vppCounts(address, (result) => {
      if (!result.isNone) {
        console.log(`电厂数量：${result.toNumber()}`);
        setCount(result.toNumber());
      }
    });
  },[api]);

  // get datasource
  useEffect(() => {
    if (!api || !count) return;
    const source = [];
    for (let i=0; i<count; i++ ) {
      api.query.tradeModule.vppList([address,i], (result) => {
        if (!result.isNone) {
          const data = result.toJSON();
          console.log(JSON.stringify(data));
          source.push({
            id: i,
            address: address,
            logo: 'https://gw.alipayobjects.com/zos/rmsportal/zOsKZmFRdUtvpqCImOVY.png',
            latest: new Date().toLocaleDateString(),
            total: 0,
            canSell: data.pre_total_stock,
            needBuy: data.sold_total,
            name: data.vpp_name,
            type: data.energy_type,
            sellPrice: data.sell_price,
            buyPrice: data.buy_price,
            status: data.business_status === 'Opened' ? '营业中':'歇业',
            code: data.post_code,
            loss: data.transport_lose
          });
        }
      });
    }
    setTimeout(function () {
      setDataSource(source);
    }, 500*count);
  }, [count, api]);

  //  *********** create vpp *********** //
  const getFromAcct = async () => {
    if (!accountPair) {
      console.log('No accountPair!');
      return ;
    }

    const {
      addr,
      meta: {source, isInjected}
    } = accountPair;
    let fromAcct;

    // signer is from Polkadot-js browser extension
    if (isInjected) {
      const injected = await web3FromSource(source);
      fromAcct = addr;
      api.setSigner(injected.signer);
    } else {
      fromAcct = accountPair;
    }

    return fromAcct;
  };

  const signedTx = async (values) => {
    const paramFields = [true, true, true, true, true, true, true, true, true, true, true];
    const inputParams =
      [
        values.name,
        values.pre_total_stock,
        0,
        (Number(values.electric_type) !== 0),
        values.energy_type,
        values.buy_price,
        values.sell_price,
        values.post_code,
        values.transport_lose,
        "Opened",
        values.device_id
      ];
    const fromAcct = await getFromAcct();
    const transformed = transformParams(paramFields, inputParams);
    // transformed can be empty parameters

    const txExecute = transformed
      ? api.tx.tradeModule.createvpp(...transformed)
      : api.tx.tradeModule.createvpp();

    const unsu = await txExecute.signAndSend(fromAcct, txResHandler)
      .catch(txErrHandler);
    setUnsub(() => unsu);
  };

  const transaction = (values) => {
    if (unsub) {
      unsub();
      setUnsub(null);
    }
    signedTx(values)
  };

  const handleSubmit = (values) => {
    console.log(values);
    setVisibleModal(false);
    if (!api && !accountPair ) return;

    transaction(values).then(r => console.log(r));
  };

  //  *********** end *********** //

  const handleCancel = () => {
    setVisibleModal(false);
  };

  const handleOpeationCancel = () => {
    setVisible(false);
  };

  const showBuyModal = (item) => {
    setOperation(1);
    setVisible(true);
  };

  const showSellModal = (item) => {
    setOperation(2);
    setVisible(true);
  };

  // buy && sell
  const handleOpeationSubmit = async (values) => {
    console.log(values);
    setVisible(false);
    if (!api && !accountPair ) return;
    const param = transformParams(
      [true, true, true, true, true, true],
      [
        address,
        0,// 该PS对应VPP编号 临时写成第一个
        values.buy_energy_number ? values.buy_energy_number : 100,// buy_energy_number sell_energy_number
        values.buy_energy_number ? values.buy_energy_number : 100,// buy_energy_token_amount sell_energy_token_amount
        values.type,
        10000,// pu_ammeter_id pg_ammeter_id 消费者电表编号
      ]
    );
    if (unsub) {
      unsub();
      setUnsub(null);
    }
    const fromAcct = await getFromAcct();
    if (operation === 1) {// buy
      const unsu = await api.tx.tradeModule.buyenergy(...param).signAndSend(fromAcct, ({status}) => {
        if (status.isFinalized) {
          try {
            (async () => {
              const params = transformParams(
                [true, true, true, true, true, true, true, true],
                [
                  address,
                  0,// PS对应VPP编号
                  values.buy_energy_number,
                  values.buy_energy_number,
                  true,// 合同分类
                  0, // 能源类型
                  values.type,
                  10000,// 电表编号
                ]);
              await api.tx.contractModule.addcontract(...params).signAndSend(fromAcct, txResHandler).catch(txErrHandler);
            })()
          } catch (error) {
            console.log(error)
          }
        } else {
          message.info(`Current transaction status: ${status.type}`);
        }
      }).catch(txErrHandler);
      setUnsub(() => unsu);
    } else { // sell
      const unsu = await api.tx.tradeModule.sellenergy(...param).signAndSend(fromAcct, ({status}) => {
        if (status.isFinalized) {
          try {
            (async () => {
              const params = transformParams(
                [true, true, true, true, true, true, true, true],
                [
                  address,
                  0,// PS对应VPP编号
                  values.buy_energy_number,
                  values.buy_energy_number,
                  false,// 合同分类
                  0, // 能源类型
                  values.type,
                  10000,// 电表编号
                ]);
              await api.tx.contractModule.addcontract(...params).signAndSend(fromAcct, txResHandler).catch(txErrHandler);
            })()
          } catch (error) {
            console.log(error)
          }
        } else {
          message.info(`Current transaction status: ${status.type}`);
        }
      }).catch(txErrHandler);
      setUnsub(() => unsu);
    }
  };

  // close ps
  const closePs = async (status) => {
    if (!api && !accountPair) return;
    const param = transformParams(
      [true, true],
      [
        0,// 该PS对应VPP编号
        status === "开业" ? "Opened" : "Closed" ,
      ]
    );
    if (unsub) {
      unsub();
      setUnsub(null);
    }
    const fromAcct = await getFromAcct();
    const unsu = await api.tx.tradeModule.setvppstatus(...param).signAndSend(fromAcct, txResHandler).catch(txErrHandler);
  };

  const closeClick = (status) => {
    Modal.confirm({
      title: '操作提示',
      content: `是否确定${status}？`,
      okText: '确认',
      cancelText: '取消',
      onOk: () => {closePs(status)},
    });
  };

  const extraContent = (
    <div className={styles.extraContent}>
      <RadioGroup defaultValue="all">
        <RadioButton value="all">全部</RadioButton>
        <RadioButton value="progress">营业中</RadioButton>
        <RadioButton value="waiting">歇业中</RadioButton>
      </RadioGroup>
      <Search className={styles.extraContentSearch} placeholder="请输入邮编进行搜索" onSearch={() => ({})}/>
      <Button type="primary" onClick={() => {
        setAddEdit(1);
        setVisibleModal(true);
      }}>
        新增电厂
      </Button>
    </div>
  );

  return (
    <div>
      <PageHeaderWrapper>
        <div className={styles.standardList}>
          <Card
            className={styles.listCard}
            bordered={false}
            title=""
            style={{
              marginTop: 24,
            }}
            bodyStyle={{
              padding: '0 32px 40px 32px',
            }}
            extra={extraContent}
          >
            <List
              size="large"
              rowKey="id"
              pagination={paginationProps}
              dataSource={dataSource}
              renderItem={item => (
                <TradeListCell
                  item={item}
                  admin={address && address === item.address}
                  buyClick={() => {
                    showBuyModal(item);
                  }}
                  sellClick={() => {
                    showSellModal(item)
                  }}
                  editClick={() => {
                    //setAddEdit(2);
                    //setVisibleModal(true);
                  }}
                  closeClick={(status) => {
                    closeClick(status)
                  }}
                />
              )}
            />
          </Card>
        </div>
      </PageHeaderWrapper>

      <OperationModal
        visible={visible}
        operation={operation}
        onCancel={handleOpeationCancel}
        onSubmit={handleOpeationSubmit}
      />
      <AddEditModal
        visible={visibleModal}
        addEdit={addEdit}
        onCancel={handleCancel}
        onSubmit={handleSubmit}
      />
    </div>
  );
};
export default TradeList;
